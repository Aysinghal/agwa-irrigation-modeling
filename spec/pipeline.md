# Pipeline

Where every artifact physically lives, and how data moves between systems.

`glossary.md` says what the datasets mean. `data.md` gives their specifications
and how the training set was built. This file gives addresses.

## Systems

Three places hold parts of this project.

**Earth Engine** holds the source imagery, the labeling interface, every
intermediate asset, and the labels themselves. Everything produced so far lives
here.

**The cluster** — UMD Zartan or Nexus — is where training runs. Nothing is there
yet.

**This repository** holds the specification, the research log, the labeling code
that produced the dataset, and — since the export — the labels themselves and
the code that assembles them.

Data now moves out of Earth Engine as well as in. Labels and the CDL field set
are exported to Drive, pulled into `data/raw/`, and assembled by
`scripts/build_label_table.py` into `data/labels.csv`. The path onto the cluster
does not exist yet.

## Earth Engine

**Project:** `projects/irrigation-mapping-agwa`

All project assets sit under `projects/irrigation-mapping-agwa/assets/`. Paths
below are relative to that prefix.

### Source datasets

| Collection ID | Used for |
|---|---|
| `USDA/NAIP/DOQQ` | Aerial imagery labelers viewed; the model's primary input |
| `USDA/NASS/CDL` | Field boundary derivation and crop class |
| `TIGER/2018/States` | Maryland boundary, filtered to `NAME == 'Maryland'` |

### Produced assets

| Asset | Contents |
|---|---|
| `center_pivot_irrigation_trusses` | The legacy truss map. An input, not produced here. |
| `assignments/truss_point_assignments_md_v1` | Positive labeling assignments — points, labeler, queue position |
| `assignments/negative_field_assignments_md_v1` | Negative candidate assignments — fields, labeler, queue position |
| `cdl_fields_md_2022` | All CDL-derived field polygons for Maryland |
| `cdl_fields_positive_md_2022` | Fields promoted under the superseded rule. Retained as the comparison `D-02` was validated against. |
| `cdl_fields_excluded_md_2022` | Every field touching a hand-drawn label; the negative no-sample zone |
| `training_fields_md_2022` | The labeled set as Earth Engine built it. Superseded by `data/labels.csv`; see below. |

### Per-labeler folders

Individual labels are stored one asset per decision, under four folder trees.
These hold hundreds of assets and are described by convention rather than
enumerated:

| Path pattern | Written by |
|---|---|
| `labels/<user>/point_<id>_label` | A drawn positive polygon |
| `progress/<user>/point_<id>_completed` and `_skipped` | Positive labeling progress marker |
| `labels_negative/<user>/field_<id>_confirmed` | A confirmed negative field |
| `progress_negative/<user>/field_<id>_confirmed` and `_rejected` | Negative labeling progress marker |

`<user>` is a lowercase first name. Progress markers carry the labeler's written
note, which for skips and rejects is a required free-text reason — the raw
material for testing `A-04`.

### Naming conventions

Assets carry a region and either a year or a version: `_md_2022` for anything
tied to the 2022 label year, `_md_v1` for assignment tables that could be
regenerated with different parameters. New assets should follow the same
pattern rather than overwrite an existing name.

## Provenance chain

The labeling code is vendored in this repository at `gee/labeling/`, unmodified.
It runs in the Earth Engine Code Editor, not locally. Scripts are numbered in
their header comments; the filenames are not ordered, so the mapping is:

| # | File | Produces |
|---|---|---|
| 1 | `datapoint_assignment.js` | `assignments/truss_point_assignments_md_v1` |
| 2 | `labeling.js` | `labels/<user>/…`, `progress/<user>/…` |
| 3 | `build_cdl_fields.js` | `cdl_fields_md_2022` |
| 4 | `explore_overlap.js` | Nothing. Diagnostic — produced the overlap threshold. |
| 5 | `promote_positives.js` | `cdl_fields_positive_md_2022`, `cdl_fields_excluded_md_2022` |
| 6 | `negative_assignment.js` | `assignments/negative_field_assignments_md_v1` |
| 7 | `labeling_negative.js` | `labels_negative/<user>/…`, `progress_negative/<user>/…` |
| 8 | `merge_training_set.js` | `training_fields_md_2022` |

`view_assignments.js` is an unnumbered utility for viewing assignments on a map.

**Scripts 5 and 8 no longer produce the labeled set.** Promotion and assembly
happen in `scripts/build_label_table.py` under `D-02`. Both stay as a record
and are not rerun. `gee/export/` moves the inputs out.

Two later scripts run locally rather than in Earth Engine:

| # | File | Produces |
|---|---|---|
| 9 | `scripts/build_label_table.py` | `data/labels.csv`, `data/labels.geojson` |
| 10 | `scripts/build_review_queues.py` | `data/review_queues.csv`, `data/review_queues.geojson` |

Script 10 builds the round-2 review queues `D-03` decides the shape of, and
assigns them. Its geojson is uploaded as `assignments/review_queues_md_v2` and
carries geometry, so the interfaces need no join.

The geojson carries only the columns a labeler may see — `is_shared`, `origin`
and `round1_labeler` stay in the local CSV, since a labeler can inspect any
asset their script loads and `D-03` requires the shared subset to be
indistinguishable from the rest of their queue.

Round 2 adds two Earth Engine scripts, which read that asset:

| # | File | Produces |
|---|---|---|
| 11 | `review_positive.js` | `review_labels_a/<user>/…`, `review_progress_a/<user>/…` |
| 12 | `review_negative.js` | `review_labels_b/<user>/…`, `review_progress_b/<user>/…` |

Both are per-labeler and batch ten decisions, as Scripts 2 and 7 did. Assets are
named `item_<queue_index>_<answer>`: a `D-01` field_id opens with a minus sign
and holds an underscore, which neither an asset id nor Script 7's name-parsing
regex tolerates, so field_id travels as a property.

Scripts 2 and 7 are per-labeler: each person set `USER` at the top and ran their
own queue. Both batch up to ten decisions before requiring the Earth Engine
Tasks tab to be run.

## Reproducibility, and an unbacked-up asset

Scripts 1, 3, 5, 6 and 8 are deterministic. They read published datasets and
project assets, use a fixed random seed of 42 wherever sampling occurs, and
re-running them reproduces their outputs exactly.

**Scripts 2 and 7 are not reproducible at all.** They record 1,781 human
decisions made by seven people. Nothing regenerates them.

> **The hand-drawn labels are irreplaceable.** Every other asset can be rebuilt
> from published data and the vendored scripts. The labels cannot.

They are committed under `data/raw/`, so a copy exists wherever the repository
is cloned (`2026-09-15-labeler-skip-rate-heterogeneity`).

## Getting data out of Earth Engine

**Labels: done, via Drive.** `gee/export/backup_all_labels.js` merges each
per-labeler folder tree into one collection, so the label set comes out in ten
files rather than fifteen hundred. `gee/export/export_cdl_fields.js` exports the
CDL field set, the promotion outputs, and the legacy truss map. Both write
GeoJSON to Drive, which is staging only — Drive belongs to one person's account,
so the committed copy here is the backup.

**Imagery: not yet decided.** The route and format for per-field chips are
open. Sizing: at NAIP resolution the labeled set is on the order of a few GB,
and statewide inference on the order of 100 GB, which is not stored — fields are
scored and the pixels discarded.

One consequence reaches into the model: if per-field image chips are exported,
tiling can happen server-side in Earth Engine or locally after export. Those are
different pipelines with different storage footprints and iteration speeds. The
fork is described in `model.md` and is settled by whichever export path is
chosen.

Chip volume at NAIP resolution is a few GB for the labeled set and on the
order of 100 GB statewide. The latter is not stored — fields are scored and the
pixels discarded.

## Training environment

Training targets UMD's Zartan or Nexus clusters. Dr. Humber's HPC lab is also
available.

**Not yet decided:** which cluster, how data is staged onto it, environment and
dependency management, and whether training runs interactively or as scheduled
batch jobs. These follow from the export decision above and from the storage
each cluster makes available.

## Repository layout

| Path | Holds |
|---|---|
| `spec/` | The specification, including `spec/decisions/` |
| `research-log/` | Dated entries |
| `gee/labeling/` | Vendored labeling code. A record, never modified in place. |
| `gee/export/` | Scripts that pull assets out of Earth Engine |
| `scripts/` | Local processing. Scripts 9 and 10. |
| `data/raw/` | Earth Engine exports, as exported |
| `data/` | `labels.csv`, the assembled table every later stage reads, and `review_queues.csv` |

Only irreplaceable data is committed. `data/raw/` holds the human labels, which
nothing can regenerate. The CDL exports under the same directory are
deterministic outputs of `gee/labeling/` and are gitignored, as are
`data/labels.geojson` and `data/review_queues.geojson`, which Scripts 9 and 10
rebuild.

`data/review_queues.csv` is committed even though Script 10 is deterministic.
Who reviewed which field is what makes a second opinion second, and the
per-labeler rate checks need the mapping intact, so a change to it has to show
up in a diff.

Layout for training code is not yet established.
