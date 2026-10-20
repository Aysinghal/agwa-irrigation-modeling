#!/usr/bin/env python3
"""
Script 10 — build the round-2 review queues and assign them.

Writes data/review_queues.csv: one row per field a labeler has to answer about,
carrying which queue it belongs to, who it is assigned to, and where it came
from. spec/decisions/D-03 decides what the round asks; this decides who is asked
what.

Why a committed table
---------------------
Assignment is the one thing in this round that cannot be re-derived afterwards.
Who looked at which field determines whether a second opinion is actually
second, and the per-labeler rate checks that produced both round-1 findings need
the mapping intact. A file in git means changing it shows up in a diff.

Why local rather than in Earth Engine
-------------------------------------
Round 1 built its assignments in Earth Engine (Scripts 1 and 6). The geometry
needed here is the same kind that went wrong there — 2026-10-05-promotion-
overlap-measure records a pixel-area error that inflated every overlap ratio by
1.28x and went undetected because the stored value was capped. Script 9 already
does exact polygon intersection locally, so this reuses it.

The queues
----------
Queue A — positive re-check. Every CDL field a round-1 hand-drawn label touched
at all, plus the fields under the 87 skipped pivots. Tagged by how round 1
decided it:

  both_measures   407  both D-02 measures promoted it
  single_measure  461  one D-02 measure promoted it
  band            576  neither did
  skipped_point     ?  under a skipped pivot; counted at runtime

The 407 are included rather than trusted. Two measures agreeing establishes
which field a blob maps to; it is silent on whether a truss is there. That claim
rests on one person looking once, having been shown a legacy-map pin saying a
pivot was present — which is the shape of error that over-calls. The 407 and the
461 carry identical truss evidence and differ only in geometric certainty, so
excluding the 407 would leave the project's largest block of positives as the
one group nobody ever re-checked.

Sampling them was the alternative. It was rejected because a rate does not fix
labels: any non-zero result forces a review of the rest to find out which ones,
so sampling only saves work in the case where nothing is wrong.

The 6 band fields and 13 positives originating in the negative pass stay out —
D-03 keeps negative-pass provenance out of the positive queue.

Queue B — negative re-check. All 933 confirmed negatives. The trusses being
looked for are by definition the ones nobody flagged, so no subset of the 933 is
more likely to hold them than any other.

Finding the skipped-pivot fields
--------------------------------
A skipped point is a legacy pivot centroid with no label drawn on it, so nothing
links it to a field. The legacy map carries Acres per pivot, which gives a
radius; a circle of that area around the point approximates the pivot footprint
closely enough to ask about. This goes through Acres rather than the legacy
geometry because that layer mixes LineString, Polygon, MultiPolygon and
GeometryCollection, and a LineString has no area to intersect.

A field enters the queue when the circle covers CANDIDATE_SHARE of it, or it
covers CANDIDATE_SHARE of the circle. Both measures, loose on purpose: under
D-03 a threshold decides what gets *asked*, not what gets *labeled*, so being
too generous costs one extra answer rather than a wrong label.

The shared subsets
------------------
Each queue reserves fields assigned to every labeler, which is what yields an
agreement figure for A-03. The two are separate because the queues ask different
questions, and neither is marked in what a labeler sees.

What each can measure differs. Queue A's subset carries trusses at a high rate,
so it measures agreement on truss judgement. Queue B's cannot: at the 1-3%
contamination in data.md a subset this size expects one or two truss-bearing
fields, so it measures agreement on empty-field judgement instead — "no" against
"unsure" against "not a field". The contamination rate itself comes from the
full Queue B pass, not from its shared subset.

Self-review
-----------
No field is assigned to the person who judged it in round 1, shared fields
included — those go to the other six. labels.csv carries source_labeler on every
row, so this is a hard constraint and the capacity targets bend around it.

Usage
-----
    python scripts/build_review_queues.py
"""

from __future__ import annotations

import csv
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

from shapely import set_precision
from shapely.geometry import Polygon, shape
from shapely.strtree import STRtree

# ---------------------------------------------------------------- config

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

LABELERS = ["ayush", "maddie", "mara", "mike", "sienna", "taryn", "tien"]

# Relative shares, not counts. Round 1 hard-coded counts and needed a sanity
# check that they summed to the queue size; shares survive a queue that changes
# size.
#
# Even, unlike round 1's negative pass, which ran 40 fields to 201 by labeler on
# a workload-fairness argument. That spread is what made its truss-detection
# test unusable — 2026-09-17-negative-pass-rejections reports expected counts
# below 5 in every cell. The positive pass was even and its skip-rate test came
# out conclusive on the same seven people. Round 2 exists to measure labeler
# behaviour, so equal n is the point rather than a nicety.
WEIGHTS = {u: 1 for u in LABELERS}

# Agreement statistics stabilise around 50-100 items. Each shared field costs
# six extra judgements, so this is the main lever on total cost; the run prints
# the overhead it produces.
SHARED_A = 60
SHARED_B = 60

# Loose on purpose — see the docstring.
CANDIDATE_SHARE = 0.05

KEY_PRECISION = 1_000_000  # D-01: degrees x 1e6, rounded
RANDOM_SEED = 42           # same convention as round 1
ACRE_M2 = 4046.8564224
CIRCLE_SEGMENTS = 64


def log(msg: str = "") -> None:
    print(msg, flush=True)


def load_features(name: str) -> list[dict]:
    path = RAW / name
    if not path.exists():
        sys.exit(f"ERROR: missing required input {path}")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)["features"]


def field_key(geom) -> str:
    """D-01's identifier. Must stay identical to build_label_table.py."""
    c = geom.centroid
    return f"{round(c.x * KEY_PRECISION)}_{round(c.y * KEY_PRECISION)}"


def safe_intersection_area(a, b) -> float:
    try:
        return a.intersection(b).area
    except Exception:
        return a.buffer(0).intersection(b.buffer(0)).area


def pivot_circle(point, acres: float) -> Polygon:
    """A circle of the pivot's own area, centred on the point, in degrees.

    Built from the local metre-per-degree scale rather than by buffering in
    degrees directly, which would stretch the circle east-west at this latitude.
    """
    radius_m = math.sqrt(acres * ACRE_M2 / math.pi)
    dlat = radius_m / 110_574.0
    dlon = radius_m / (111_320.0 * math.cos(math.radians(point.y)))
    ring = [
        (
            point.x + dlon * math.cos(2 * math.pi * i / CIRCLE_SEGMENTS),
            point.y + dlat * math.sin(2 * math.pi * i / CIRCLE_SEGMENTS),
        )
        for i in range(CIRCLE_SEGMENTS)
    ]
    return Polygon(ring), radius_m


# ---------------------------------------------------------------- load

log("=" * 68)
log("SCRIPT 10 — BUILD REVIEW QUEUES")
log("=" * 68)

log("\nLoading inputs...")

labels_path = OUT / "labels.csv"
if not labels_path.exists():
    sys.exit(f"ERROR: missing {labels_path} — run build_label_table.py first")
with labels_path.open(encoding="utf-8") as fh:
    label_rows = list(csv.DictReader(fh))

cdl_raw = load_features("cdl_fields_md_2022.geojson")
progress_raw = load_features("backup_positive_progress.geojson")
assign_raw = load_features("backup_truss_point_assignments.geojson")

log(f"  labels.csv rows        {len(label_rows):>7,}")
log(f"  CDL fields             {len(cdl_raw):>7,}")
log(f"  positive markers       {len(progress_raw):>7,}")
log(f"  round-1 assignments    {len(assign_raw):>7,}")

# ---------------------------------------------------------------- index CDL

log("\nIndexing CDL fields...")

cdl_geoms = [shape(f["geometry"]) for f in cdl_raw]
cdl_props = [f["properties"] for f in cdl_raw]
cdl_keys = [field_key(g) for g in cdl_geoms]

dupes = [k for k, n in Counter(cdl_keys).items() if n > 1]
if dupes:
    log(f"  !! {len(dupes)} duplicate field_id values — D-01 assumes uniqueness")
key_to_index = {k: i for i, k in enumerate(cdl_keys)}
tree = STRtree(cdl_geoms)
log(f"  {len(cdl_keys):,} field ids indexed")

# ---------------------------------------------------------------- queues from labels.csv

log("\nSelecting queue members from labels.csv...")

queued: dict[str, dict] = {}
already_classed: set[str] = set()

sample_type_by_field = {r["field_id"]: r["sample_type"] for r in label_rows}

for r in label_rows:
    fid = r["field_id"]
    already_classed.add(fid)

    if r["source"] == "legacy_seed":
        queue = "A"
        origin = {
            "both": "both_measures",
            "blob_share": "single_measure",
            "field_coverage": "single_measure",
            "": "band",
        }[r["promoted_by"]]
    elif r["sample_type"] == "negative":
        queue, origin = "B", "negative"
    else:
        continue

    queued[fid] = {
        "field_id": fid,
        "queue": queue,
        "origin": origin,
        "round1_labeler": r["source_labeler"],
        "source_point_id": r["source_point_id"],
        "pivot_point_id": "",
        "area_m2": r["area_m2"],
        "crop_class": r["crop_class"],
    }

counts = Counter((v["queue"], v["origin"]) for v in queued.values())
for key in sorted(counts):
    log(f"  queue {key[0]}  {key[1]:<16} {counts[key]:>5,}")

# ---------------------------------------------------------------- skipped pivots

log("\nFinding CDL fields under the 87 skipped pivots...")

assign_by_point = {f["properties"]["point_id"]: f["properties"] for f in assign_raw}
skipped = [f for f in progress_raw if f["properties"].get("status") == "skipped"]
log(f"  skipped markers            {len(skipped):>5,}")

no_acres = added = 0
already: Counter[str] = Counter()
radii: list[float] = []
per_pivot: list[int] = []

for f in skipped:
    props = f["properties"]
    pid = props["point_id"]
    acres = assign_by_point.get(pid, {}).get("Acres")
    if acres in (None, ""):
        no_acres += 1
        continue

    point = shape(f["geometry"])
    circle, radius_m = pivot_circle(point, float(acres))
    radii.append(radius_m)

    hits = 0
    for idx in tree.query(circle):
        idx = int(idx)
        geom = cdl_geoms[idx]
        inter = safe_intersection_area(circle, geom)
        if inter <= 0:
            continue
        if inter / geom.area < CANDIDATE_SHARE and inter / circle.area < CANDIDATE_SHARE:
            continue
        hits += 1
        fid = cdl_keys[idx]
        if fid in queued or fid in already_classed:
            # Already covered, so do not ask twice — but keep the hint that a
            # reported pivot sits here. If the re-review finds a truss on it,
            # that the legacy map agreed is worth knowing.
            covered_as = (
                queued[fid]["origin"] if fid in queued
                else sample_type_by_field.get(fid, "unknown")
            )
            already[covered_as] += 1
            if fid in queued and not queued[fid]["pivot_point_id"]:
                queued[fid]["pivot_point_id"] = str(pid)
            continue
        queued[fid] = {
            "field_id": fid,
            "queue": "A",
            "origin": "skipped_point",
            "round1_labeler": props.get("labeler", ""),
            "source_point_id": "",
            "pivot_point_id": str(pid),
            "area_m2": cdl_props[idx].get("area_m2", ""),
            "crop_class": cdl_props[idx].get("crop_class", ""),
        }
        added += 1
    per_pivot.append(hits)

if no_acres:
    log(f"  !! {no_acres} skipped points carried no Acres value and were not expanded")

radii.sort()
per_pivot.sort()
log(f"  pivot radius m  min/median/max   "
    f"{radii[0]:.0f} / {radii[len(radii) // 2]:.0f} / {radii[-1]:.0f}")
log(f"  fields found under a pivot       {sum(per_pivot):>5,}")
log(f"    added to queue A               {added:>5,}")
log(f"    already covered               {sum(already.values()):>5,}")
for st, n in already.most_common():
    log(f"      in queue as {st:<16} {n:>5,}")
log(f"  fields per pivot, median         {per_pivot[len(per_pivot) // 2]:>5,}")
log(f"  pivots matching no field         {sum(1 for n in per_pivot if n == 0):>5,}")

# ---------------------------------------------------------------- shared subsets

log("\nReserving shared subsets...")

rng = random.Random(RANDOM_SEED)

queue_a = sorted(k for k, v in queued.items() if v["queue"] == "A")
queue_b = sorted(k for k, v in queued.items() if v["queue"] == "B")

shared: set[str] = set()
for name, pool, n in (("A", queue_a, SHARED_A), ("B", queue_b, SHARED_B)):
    if n > len(pool):
        sys.exit(f"ERROR: SHARED_{name}={n} exceeds queue {name} size {len(pool)}")
    shared.update(rng.sample(pool, n))
    log(f"  queue {name}  {n} of {len(pool):,} fields, to every labeler but its round-1 one")

solo = [k for k in queue_a + queue_b if k not in shared]
shared_judgments = len(shared) * (len(LABELERS) - 1)
total_judgments = len(solo) + shared_judgments
log(f"  judgements: {len(solo):,} solo + {shared_judgments:,} shared = "
    f"{total_judgments:,} over {len(queued):,} fields "
    f"({total_judgments / len(queued) - 1:+.0%} on one-each)")

# ---------------------------------------------------------------- assign

log("\nAssigning...")

weight_total = sum(WEIGHTS[u] for u in LABELERS)
assignments: dict[str, list[str]] = defaultdict(list)
placed: dict[str, Counter[str]] = {u: Counter() for u in LABELERS}
over_quota = 0

# Balanced within each queue, not across the pair. Balancing only the combined
# total lets round 1's uneven negative allocation back in: no-self-review bars
# tien from 193 Queue B fields and ayush from 37, so filling equal totals draws
# tien's shortfall out of Queue A and hands ayush the Queue B surplus. Queue B
# exists to measure per-labeler truss detection, which needs comparable n in
# that queue specifically.
targets: dict[str, dict[str, float]] = {}
for q in ("A", "B"):
    solo_q = [fid for fid in solo if queued[fid]["queue"] == q]
    targets[q] = {u: len(solo_q) * WEIGHTS[u] / weight_total for u in LABELERS}

    order = solo_q[:]
    rng.shuffle(order)

    for fid in order:
        round1 = queued[fid]["round1_labeler"]
        eligible = [u for u in LABELERS if u != round1] or LABELERS[:]
        # The most under-quota eligible person, measured as a share of their own
        # target so the weighting holds rather than the raw count.
        pick = min(
            eligible,
            key=lambda u: placed[u][q] / targets[q][u] if targets[q][u] else 1e9,
        )
        if placed[pick][q] >= targets[q][pick]:
            over_quota += 1
        assignments[pick].append(fid)
        placed[pick][q] += 1

log(f"  {'labeler':<9} {'A':>6} {'B':>6} {'shared':>7} {'total':>7}")
for u in LABELERS:
    n_shared = sum(1 for fid in shared if queued[fid]["round1_labeler"] != u)
    total = placed[u]["A"] + placed[u]["B"] + n_shared
    log(f"  {u:<9} {placed[u]['A']:>6,} {placed[u]['B']:>6,} {n_shared:>7,} "
        f"{total:>7,}")
log(f"  per-queue solo targets: A {targets['A'][LABELERS[0]]:.0f}, "
    f"B {targets['B'][LABELERS[0]]:.0f}")
log(f"  solo fields placed over quota to respect no-self-review: {over_quota:,}")

violations = sum(
    1
    for u in LABELERS
    for fid in assignments[u]
    if queued[fid]["round1_labeler"] == u
)
log(f"  fields assigned to their own round-1 labeler: {violations:,}")

# ---------------------------------------------------------------- write

log("\nWriting...")

FIELDS = [
    "field_id", "queue", "assigned_to", "queue_index", "is_shared",
    "origin", "round1_labeler", "source_point_id", "pivot_point_id",
    "area_m2", "crop_class",
]

# What the labeling interfaces are allowed to see. See the upload note below.
UPLOAD_FIELDS = [
    "field_id", "queue", "assigned_to", "queue_index", "area_m2", "crop_class",
]

rows: list[dict] = []
for u in LABELERS:
    # Shared fields are mixed into the solo ones and the whole queue is shuffled,
    # so the subset cannot be picked out by position. D-03 requires this.
    own = assignments[u] + [fid for fid in sorted(shared) if queued[fid]["round1_labeler"] != u]
    rng.shuffle(own)
    for i, fid in enumerate(own):
        q = queued[fid]
        rows.append({
            "field_id": fid,
            "queue": q["queue"],
            "assigned_to": u,
            "queue_index": i,
            "is_shared": "1" if fid in shared else "0",
            "origin": q["origin"],
            "round1_labeler": q["round1_labeler"],
            "source_point_id": q["source_point_id"],
            "pivot_point_id": q["pivot_point_id"],
            "area_m2": q["area_m2"],
            "crop_class": q["crop_class"],
        })

csv_path = OUT / "review_queues.csv"
with csv_path.open("w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)
log(f"  {csv_path.relative_to(ROOT)}  {len(rows):,} rows")

# The Earth Engine upload. WKT in a CSV column rather than GeoJSON, because the
# Code Editor's table uploader takes CSV or shapefile and not GeoJSON.
# Regenerable, so gitignored — the same split as labels.csv against
# labels.geojson.
#
# Only UPLOAD_FIELDS travel to Earth Engine. is_shared, origin and
# round1_labeler stay in the local CSV: a labeler can inspect any asset their
# script loads, and D-03 requires the shared subset to be indistinguishable
# from the rest of their queue. origin would also tell them what the promotion
# script had concluded, which is the judgement being re-collected. The ingest
# recovers all three by joining on field_id.
upload_path = OUT / "review_queues_upload.csv"
missing = 0
written = 0
with upload_path.open("w", newline="", encoding="utf-8") as fh:
    writer = csv.writer(fh)
    writer.writerow(["wkt"] + UPLOAD_FIELDS)
    for r in rows:
        idx = key_to_index.get(r["field_id"])
        if idx is None:
            missing += 1
            continue
        # Rounded to the D-01 key precision, about 0.11 m. Full float repr
        # roughly doubles the file for digits no 30 m polygon carries.
        geom = set_precision(cdl_geoms[idx], 1e-6)
        writer.writerow([geom.wkt] + [r[k] for k in UPLOAD_FIELDS])
        written += 1
if missing:
    log(f"  !! {missing} rows had no CDL geometry and are absent from the upload")
size_mb = upload_path.stat().st_size / 1048576
log(f"  {upload_path.relative_to(ROOT)}  {written:,} rows, {size_mb:.1f} MB")
log(f"    upload as a CSV table, geometry column 'wkt'")

log("\nDone.")
