#!/usr/bin/env python3
"""
Script 9 — rebuild the labeled field table with provenance attached.

Reads the Earth Engine exports in data/raw/ and writes one table that every
later stage consumes: splits, the benchmark, and training.

Why this exists
---------------
gee/labeling/promote_positives.js rasterizes all 693 hand-drawn labels into a
single mask before measuring overlap, so the link between a promoted field and
the label that promoted it is destroyed. spec/evaluation.md requires every field
tracing to the same hand-drawn label to land on the same side of every split,
which is impossible without that link. Rebuilding it is the main job here.

Four jobs
---------
1. Match each hand-drawn label to CDL fields individually, keeping the link.
2. Give every field the centroid identifier decided in spec/decisions/D-01.
3. Recover the 19 truss-bearing fields rejected during the negative pass,
   tagged with their own provenance rather than merged into the legacy-seeded
   positives (2026-09-17-negative-pass-rejections).
4. Repair the two damaged records: drop field_343, restore field_450.

Method note
-----------
Overlap is computed by exact polygon intersection, where Earth Engine used a
10 m raster. Exact intersection is more accurate, but a field sitting near the
0.65 promotion threshold can land on the other side of it. The script therefore
compares its own positive set against the Earth Engine one and reports the
difference rather than hiding it.

Ratios are computed in planar degrees. A ratio is intersection area over field
area, both measured over the same small polygon, so the projection's scale
distortion cancels. Reported areas come from the geodesic area_m2 that Earth
Engine already computed.

Usage
-----
    python scripts/build_label_table.py
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

# ---------------------------------------------------------------- config

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

PROMOTION_THRESHOLD = 0.65  # gee/labeling/promote_positives.js
KEY_PRECISION = 1_000_000  # D-01: degrees x 1e6, rounded

# Damaged records, from the export verification in commit 3c91253.
DROP_NEGATIVE_QUEUE_IDS = {343}  # rejected 04:14, confirmed 04:21 "not a land"
RESTORE_NEGATIVE_QUEUE_IDS = {450}  # confirmed, label asset never written

# Words that mark a rejection as "this field has a truss" rather than
# "this is not a field". Matched case-insensitively.
TRUSS_WORDS = ("truss", "pivot", "circular irrigation")
# Among those, wording that places the truss at or past the boundary. These are
# the Q-03 partial-overlap situation and are held out rather than promoted.
EDGE_WORDS = ("edge", "neighbo", "side", "part of", "overlap", "touching")


def log(msg: str = "") -> None:
    print(msg, flush=True)


def load_features(name: str, required: bool = True) -> list[dict]:
    path = RAW / name
    if not path.exists():
        if required:
            sys.exit(f"ERROR: missing required input {path}")
        return []
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)["features"]


def field_key(geom) -> str:
    """The identifier decided in D-01: centroid in degrees, x1e6, rounded.

    Computed planar rather than geodesically. The difference is far below the
    0.1 m rounding step for fields of this size, and computing it one way in one
    place is what makes the key reproducible. Anything recomputing these keys
    must use the same definition.
    """
    c = geom.centroid
    return f"{round(c.x * KEY_PRECISION)}_{round(c.y * KEY_PRECISION)}"


def classify_rejection(note: str) -> str | None:
    """'truss', 'truss_edge', or None for a not-a-field rejection."""
    low = note.lower()
    if not any(w in low for w in TRUSS_WORDS):
        return None
    return "truss_edge" if any(w in low for w in EDGE_WORDS) else "truss"


# ---------------------------------------------------------------- load

log("=" * 68)
log("SCRIPT 9 — BUILD LABEL TABLE")
log("=" * 68)

log("\nLoading inputs...")

cdl_raw = load_features("cdl_fields_md_2022.geojson")
labels_raw = load_features("backup_positive_labels.geojson")
negatives_raw = load_features("backup_negative_labels.geojson")
neg_progress_raw = load_features("backup_negative_progress.geojson")
ee_positives_raw = load_features("cdl_fields_positive_md_2022.geojson", required=False)
legacy_raw = load_features("center_pivot_irrigation_trusses.geojson", required=False)

log(f"  CDL fields            {len(cdl_raw):>7,}")
log(f"  hand-drawn labels     {len(labels_raw):>7,}")
log(f"  confirmed negatives   {len(negatives_raw):>7,}")
log(f"  negative markers      {len(neg_progress_raw):>7,}")
log(f"  EE positives (check)  {len(ee_positives_raw):>7,}")
log(f"  legacy trusses        {len(legacy_raw):>7,}" if legacy_raw else
    "  legacy trusses            ABSENT — backstop will be skipped")

# ---------------------------------------------------------------- index CDL

log("\nIndexing CDL fields...")

cdl_geoms: list = []
cdl_props: list[dict] = []
for f in cdl_raw:
    cdl_geoms.append(shape(f["geometry"]))
    cdl_props.append(f["properties"])

cdl_keys = [field_key(g) for g in cdl_geoms]

dupes = [k for k, n in Counter(cdl_keys).items() if n > 1]
if dupes:
    log(f"  !! {len(dupes)} duplicate field_id values — D-01 assumes uniqueness")
    for k in dupes[:5]:
        log(f"     {k}")
else:
    log(f"  {len(cdl_keys):,} field ids, all unique")

key_to_index = {k: i for i, k in enumerate(cdl_keys)}
tree = STRtree(cdl_geoms)

# ---------------------------------------------------------------- promote

log("\nPromoting hand-drawn labels onto CDL fields, one label at a time...")

# A field can be covered by parts of several hand-drawn labels where pivots sit
# close together. Two different quantities follow, and conflating them is what
# makes a reimplementation disagree with Earth Engine:
#
#   promotion  asks how much of the field is covered by labeled truss area at
#              all, which is the UNION over every label touching it. This is
#              what promote_positives.js measures, because it burns all labels
#              into one mask before counting.
#
#   provenance asks which single label owns the field for grouping, which is the
#              label contributing the largest individual share. Earth Engine
#              cannot answer this at all, and it is the reason for this script.
#
# Both are computed and both are written out.

# field index -> list of (individual_ratio, point_id, labeler, intersection geom)
touches: dict[int, list[tuple[float, int, str, object]]] = defaultdict(list)
labels_with_no_field = []

for f in labels_raw:
    props = f["properties"]
    point_id = int(props["source_point_id"])
    labeler = props["source_labeler"]
    geom = shape(f["geometry"])
    if not geom.is_valid:
        geom = geom.buffer(0)

    hit_any = False
    for idx in tree.query(geom):
        idx = int(idx)
        field_geom = cdl_geoms[idx]
        try:
            inter = geom.intersection(field_geom)
        except Exception:
            inter = geom.buffer(0).intersection(field_geom.buffer(0))
        if inter.is_empty or inter.area <= 0:
            continue
        touches[idx].append((inter.area / field_geom.area, point_id, labeler, inter))
        hit_any = True

    if not hit_any:
        labels_with_no_field.append(point_id)

log(f"  labels processed          {len(labels_raw):>6,}")
log(f"  labels matching no field  {len(labels_with_no_field):>6,}")
log(f"  CDL fields touched        {len(touches):>6,}")

promoted: dict[int, dict] = {}
multi_label = 0
for idx, hits in touches.items():
    hits.sort(key=lambda h: h[0], reverse=True)
    own_ratio, point_id, labeler, _ = hits[0]
    if len(hits) > 1:
        multi_label += 1
        union_area = unary_union([h[3] for h in hits]).area
    else:
        union_area = hits[0][3].area
    # Capped just under 1 for the same reason promote_positives.js caps: a ratio
    # can round fractionally past 100% on a field the label fully covers.
    union_ratio = min(union_area / cdl_geoms[idx].area, 0.9999)
    promoted[idx] = {
        "overlap_ratio": union_ratio,
        "primary_label_ratio": min(own_ratio, 0.9999),
        "source_point_id": point_id,
        "source_labeler": labeler,
        "n_labels_touching": len(hits),
    }

positive_idx = {i for i, v in promoted.items() if v["overlap_ratio"] >= PROMOTION_THRESHOLD}
band_idx = {i for i, v in promoted.items() if v["overlap_ratio"] < PROMOTION_THRESHOLD}

log(f"  fields touched by >1 label {multi_label:>5,}")
log(f"  promoted to positive       {len(positive_idx):>5,}  (ratio >= {PROMOTION_THRESHOLD})")
log(f"  sub-threshold band         {len(band_idx):>5,}  (0 < ratio < {PROMOTION_THRESHOLD})")

# ---------------------------------------------------------------- check vs EE

if ee_positives_raw:
    log("\nComparing against the Earth Engine positive set...")
    ee_keys = {field_key(shape(f["geometry"])) for f in ee_positives_raw}
    local_keys = {cdl_keys[i] for i in positive_idx}
    both = ee_keys & local_keys
    log(f"  Earth Engine  {len(ee_keys):>5,}")
    log(f"  local         {len(local_keys):>5,}")
    log(f"  agree         {len(both):>5,}  ({100 * len(both) / max(len(ee_keys), 1):.1f}% of EE)")
    log(f"  EE only       {len(ee_keys - local_keys):>5,}")
    log(f"  local only    {len(local_keys - ee_keys):>5,}")
    log("  Disagreement is expected near the threshold: exact intersection")
    log("  against a 10 m raster. A large number here means something else.")

# ---------------------------------------------------------------- negatives

log("\nBuilding the negative set...")

neg_by_queue_id: dict[int, dict] = {}
for f in negatives_raw:
    props = f["properties"]
    neg_by_queue_id[int(props["source_queue_id"])] = {
        "geometry": shape(f["geometry"]),
        "labeler": props["source_labeler"],
    }

log(f"  confirmed negative assets  {len(neg_by_queue_id):>5,}")

for qid in DROP_NEGATIVE_QUEUE_IDS:
    if neg_by_queue_id.pop(qid, None) is not None:
        log(f"  dropped field_{qid} (conflicting markers; confirm note reads 'not a land')")

# field_450 has a confirmed progress marker but no label asset. Its geometry is
# on the marker, so it is recoverable without relabeling.
for f in neg_progress_raw:
    props = f["properties"]
    qid = int(props["source_queue_id"])
    if qid in RESTORE_NEGATIVE_QUEUE_IDS and props.get("marker_state") == "confirmed":
        if qid not in neg_by_queue_id:
            neg_by_queue_id[qid] = {
                "geometry": shape(f["geometry"]),
                "labeler": props["source_labeler"],
            }
            log(f"  restored field_{qid} from its progress marker")

log(f"  negatives after repair     {len(neg_by_queue_id):>5,}")

# Negatives are unmodified copies of CDL fields, so their keys should resolve.
neg_records = []
unmatched_negatives = 0
for qid, rec in neg_by_queue_id.items():
    key = field_key(rec["geometry"])
    idx = key_to_index.get(key)
    if idx is None:
        unmatched_negatives += 1
        continue
    neg_records.append((idx, qid, rec["labeler"]))

log(f"  matched to a CDL field     {len(neg_records):>5,}")
if unmatched_negatives:
    log(f"  !! unmatched               {unmatched_negatives:>5,} — geometry did not round-trip")

# A negative that a hand-drawn label touches at all contradicts the sampling
# design, which drew only from outside the exclusion set. Worth knowing.
neg_touching_label = sum(1 for idx, _, _ in neg_records if idx in touches)
if neg_touching_label:
    log(f"  !! {neg_touching_label} negatives are touched by a hand-drawn label")

# ---------------------------------------------------------------- backstop

dropped_by_backstop = set()
if legacy_raw:
    log("\nApplying the legacy truss backstop...")
    legacy_geoms = [shape(f["geometry"]) for f in legacy_raw]
    legacy_tree = STRtree(legacy_geoms)
    for idx, qid, _ in neg_records:
        g = cdl_geoms[idx]
        for j in legacy_tree.query(g):
            if g.intersects(legacy_geoms[int(j)]):
                dropped_by_backstop.add(qid)
                break
    log(f"  dropped {len(dropped_by_backstop)} negatives overlapping the legacy map")
    neg_records = [r for r in neg_records if r[1] not in dropped_by_backstop]
else:
    log("\n!! SKIPPING the legacy truss backstop — asset not exported.")
    log("!! merge_training_set.js applies it, so this negative set is not")
    log("!! directly comparable to training_fields_md_2022. Export")
    log("!! center_pivot_irrigation_trusses to close the gap.")

# ---------------------------------------------------------------- rescue 19

log("\nRecovering truss-bearing fields rejected during the negative pass...")

rescued: list[tuple[int, str, str, str]] = []  # idx, kind, labeler, note
rescue_unmatched = 0
for f in neg_progress_raw:
    props = f["properties"]
    if props.get("marker_state") != "rejected":
        continue
    kind = classify_rejection(props.get("notes") or "")
    if kind is None:
        continue
    key = field_key(shape(f["geometry"]))
    idx = key_to_index.get(key)
    if idx is None:
        rescue_unmatched += 1
        continue
    rescued.append((idx, kind, props["source_labeler"], props["notes"]))

n_clear = sum(1 for r in rescued if r[1] == "truss")
n_edge = sum(1 for r in rescued if r[1] == "truss_edge")
log(f"  truss rejections found     {len(rescued) + rescue_unmatched:>5,}")
log(f"    on the field itself      {n_clear:>5,}  -> positive, source 'negative_pass'")
log(f"    at or past the boundary  {n_edge:>5,}  -> held for Q-03")
if rescue_unmatched:
    log(f"  !! unmatched to a CDL field {rescue_unmatched:>4,}")

# ---------------------------------------------------------------- assemble

log("\nAssembling the table...")

rows: dict[int, dict] = {}


def put(idx: int, **kw) -> None:
    props = cdl_props[idx]
    row = {
        "field_id": cdl_keys[idx],
        "label_class": None,
        "sample_type": None,
        "source": None,
        "source_point_id": "",
        "source_queue_id": "",
        "source_labeler": "",
        "overlap_ratio": "",
        "primary_label_ratio": "",
        "n_labels_touching": "",
        "area_m2": round(props.get("area_m2", 0.0), 2),
        "crop_class": props.get("crop_class", ""),
        "note": "",
    }
    row.update(kw)
    rows[idx] = row


for idx in sorted(positive_idx):
    p = promoted[idx]
    put(idx, label_class=1, sample_type="positive", source="legacy_seed",
        source_point_id=p["source_point_id"], source_labeler=p["source_labeler"],
        overlap_ratio=round(p["overlap_ratio"], 4),
        primary_label_ratio=round(p["primary_label_ratio"], 4),
        n_labels_touching=p["n_labels_touching"])

for idx in sorted(band_idx):
    p = promoted[idx]
    put(idx, label_class="", sample_type="excluded_band", source="legacy_seed",
        source_point_id=p["source_point_id"], source_labeler=p["source_labeler"],
        overlap_ratio=round(p["overlap_ratio"], 4),
        primary_label_ratio=round(p["primary_label_ratio"], 4),
        n_labels_touching=p["n_labels_touching"],
        note="sub-threshold overlap; see Q-03")

for idx, qid, labeler in neg_records:
    if idx in rows:  # a promoted field cannot also be a negative
        rows[idx]["note"] = "ALSO confirmed negative — conflict"
        continue
    put(idx, label_class=0, sample_type="negative", source="negative_pass",
        source_queue_id=qid, source_labeler=labeler)

for idx, kind, labeler, note in rescued:
    if kind == "truss":
        put(idx, label_class=1, sample_type="positive", source="negative_pass",
            source_labeler=labeler, note=f"rescued from rejection: {note}")
    else:
        put(idx, label_class="", sample_type="excluded_band", source="negative_pass",
            source_labeler=labeler, note=f"truss at boundary: {note}")

log(f"  rows written {len(rows):,}")

# ---------------------------------------------------------------- summary

counts = Counter((r["sample_type"], r["source"]) for r in rows.values())
log("\n" + "=" * 68)
log("RESULT")
log("=" * 68)
for (stype, src), n in sorted(counts.items()):
    log(f"  {stype:<16s} {src:<16s} {n:>6,}")

n_pos = sum(1 for r in rows.values() if r["label_class"] == 1)
n_neg = sum(1 for r in rows.values() if r["label_class"] == 0)
log(f"\n  positives {n_pos:,}   negatives {n_neg:,}   ratio 1 : {n_neg / max(n_pos, 1):.2f}")
log(f"  production prevalence if applied to all CDL fields: "
    f"{100 * n_pos / len(cdl_raw):.2f}%")

groups = {r["source_point_id"] for r in rows.values() if r["source_point_id"] != ""}
log(f"  distinct source_point_id groups among positives/band: {len(groups):,}")

conflicts = [r for r in rows.values() if "conflict" in (r["note"] or "")]
if conflicts:
    log(f"  !! {len(conflicts)} fields are both promoted and confirmed negative")

# ---------------------------------------------------------------- write

OUT.mkdir(parents=True, exist_ok=True)
csv_path = OUT / "labels.csv"
geojson_path = OUT / "labels.geojson"

fieldnames = list(next(iter(rows.values())).keys())
with csv_path.open("w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=fieldnames)
    w.writeheader()
    for idx in sorted(rows, key=lambda i: rows[i]["field_id"]):
        w.writerow(rows[idx])

features = []
for idx in sorted(rows, key=lambda i: rows[i]["field_id"]):
    features.append({
        "type": "Feature",
        "properties": rows[idx],
        "geometry": mapping(cdl_geoms[idx]),
    })
with geojson_path.open("w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "features": features}, fh)

log(f"\nwrote {csv_path.relative_to(ROOT)}")
log(f"wrote {geojson_path.relative_to(ROOT)}")
