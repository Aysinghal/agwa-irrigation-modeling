# Data

The training dataset is a collection of field polygons over Maryland, each
labeled 1 (visible center-pivot truss) or 0 (no visible truss). It was built by
seven team members labeling aerial imagery by hand in Google Earth Engine over
the course of the labeling effort, then promoting those hand-drawn labels onto
CDL-derived field boundaries.

This file describes what the dataset is, how it was made, and what is wrong with
it. Asset locations are in `pipeline.md`. Term definitions are in `glossary.md`.

## Source datasets

**NAIP** — USDA aerial imagery, 2021–2023, 0.6–1.0 m resolution, four bands
(red, green, blue, near-infrared). Flown in the growing season. This is the
imagery labelers viewed and the primary model input. Resolution is fine enough
to resolve an individual truss.

**CDL** — USDA NASS Cropland Data Layer, 30 m, published annually. Used for two
purposes: deriving field boundaries, and recording the crop class of each field.

**Legacy truss map** — A pre-existing manual inventory of center-pivot
irrigation systems covering the Mid-Atlantic, including the Eastern Maryland
shore. Used to seed positive labeling assignments, and again at the end as a
backstop against mislabeled negatives. **It is incomplete**
(`2026-09-17-negative-pass-rejections`), which bounds both roles: it cannot seed
positives it does not contain, nor backstop against them.

**TIGER** — US Census state boundaries; the Maryland outline used to clip every
step of the pipeline.

**USGS LiDAR** (iMaps 2020 and 2023, by county) is available and was considered,
but is not used in the current dataset. See `open-questions.md`.

## How fields were defined

A CDL pixel counts as cropland if its class falls in the range 1–60. A pixel
enters the field set only if it is cropland in **all three** years 2021, 2022,
and 2023 — a consensus requirement intended to exclude land that moves in and
out of crop production.

Surviving pixels are labeled with their 2022 crop class, grouped into
four-connected clumps, and any clump smaller than **1 hectare** (10,000 m², or
about 12 CDL pixels) is dropped. The remainder is vectorized at 30 m into
polygons, each carrying its crop class and area.

Every field in this project — positive, negative, and at inference time — comes
from this same process, so field geometry is consistent across classes.

## How positive labels were made

Center-pivot polygons from the legacy truss map were clipped to Maryland and
reduced to centroids. Those points were shuffled under a fixed random seed and
distributed round-robin across the seven labelers, 100 target points each plus
20 reserve to absorb skips.

Each labeler viewed their assigned point on the NAIP mosaic and, if a truss was
still visible, hand-drew a polygon around the whole field containing it. If the
point was unusable, the labeler skipped it with a written reason. Skips are
recorded but produce no label.

Those hand-drawn polygons are not the training positives. Converting them onto
consistent geometry needs a rule for which CDL fields a label promotes, and
that rule is `D-02`: a field becomes a **positive field**, class 1, if at least
0.15 of the label falls inside it, or at least 0.65 of it lies under the label.
A field satisfying neither is a sliver and enters the excluded band (`Q-03`).

Two measures because labels are inconsistent about what they trace (below);
either alone discards a different group of irrigated fields.

## How negative labels were made

Any CDL field touching a hand-drawn label *at all* — including slivers far
below anything `D-02` would promote — was placed in the **exclusion set**. Negatives
were never sampled from it, on the reasoning that even a slight touch means a
truss is nearby.

From the remaining fields, 1000 were drawn under the same fixed seed and
distributed to labelers on a weighted split rather than evenly, so that the
members carrying less of the coding work labeled more fields. Each labeler
viewed the candidate field on NAIP and either confirmed it as empty cropland
(class 0) or rejected it with a written reason.

Confirmed negatives then passed a final automated check: any that overlapped the
legacy truss map at all were dropped. The legacy map predates our imagery, so
some of those fields may genuinely be truss-free today, and dropping them is a
deliberate trade — a clean negative set matters more than the handful of
examples lost.

## Composition

Built by `scripts/build_label_table.py` from the exports in `data/raw/`.

| | count |
|---|---|
| CDL fields in Maryland | 37,523 |
| Positive fields | 881 |
| Negative fields | 933 |
| Excluded band | 582 |
| Class ratio | 1 : 1.06 |
| Prevalence over all CDL fields | 2.35% |
| Median field area, positive / negative | 23.7 / 3.7 ha |

The 881 positives come from 635 distinct hand-drawn labels, since one label can
promote several fields. That grouping is what the split requirement in
`evaluation.md` acts on. 868 trace to the legacy seed and 13 to the negative
pass. By promotion condition: 246 label share only, 215 field coverage only,
407 both.

Underlying human decisions: 693 hand-drawn positive polygons and 87 skips from
780 points viewed; 947 confirmed negatives and 53 rejections from 1000
candidates, less 14 dropped by the legacy backstop and one unrecoverable
(`2026-09-15-labeler-skip-rate-heterogeneity`,
`2026-10-05-promotion-overlap-measure`).

Geographic distribution by county and physiographic region, and crop class
composition per class, are not yet measured.

## Known biases and limitations

**Positives are Eastern Shore; negatives are statewide.** The legacy truss map
covers only the Mid-Atlantic, so 868 of 881 positives come from the Eastern
Shore. The exception is the 13 tagged `negative_pass`, drawn uniformly from
statewide CDL fields — the only positives whose sampling frame is not the legacy
map (`2026-09-17-negative-pass-rejections`). Negatives were drawn from CDL fields across the whole
state, including the predominantly rainfed west. Class therefore correlates with
region, and a model can score well by learning soil color, field geometry, tree
lines, or imagery flight date instead of learning what a truss looks like. This
is the most serious defect in the dataset and it is the reason the reporting
population is restricted to the Coastal Plain (`problem-statement.md`).

**Training and inference populations differ.** At inference the model scores
every CDL field. In training it never saw one particular group: fields a
hand-drawn label touches by more than nothing but less than the promotion
threshold. Those sit in the exclusion set — not positives, and barred from being
negatives. Because each field is presented in isolation, cropped to its own
boundary, this is not about missing spatial context; it is that a slice of the
input distribution has no training examples and no agreed correct answer. It is
also where the hardest cases live, since a field a truss partly reaches may
genuinely be irrigated. The threshold cannot distinguish a label sliver from
real partial coverage, so it may be discarding true positives rather than only
artifacts. How that band should be labeled is an open question.

**Center-pivot only.** Linear-move and drip systems are absent from the positive
set by construction, and fields using them may sit in the negative set labeled
0. This bounds what the model can claim (`problem-statement.md`, RQ3).

**Label noise is unmeasured.** No field was labeled by more than one person, so
there is no inter-rater agreement to compute and no estimate of how often
labelers disagree. Labeling load was also uneven by design, so three labelers
account for the majority of negatives and their individual tendencies are
weighted accordingly.

**Positives are far larger than negatives.** Negatives carry the CDL
population's size distribution and positives do not (see Composition). Area
alone is therefore a usable predictor, so a model can score well by learning
size rather than structure. `evaluation.md` carries it as a baseline and holds
the figure.

**Labels are inconsistent about what they trace.** The protocol asks for the
field outline; most labelers drew the pivot circle, and median label area over
field area ranges 0.60 to 0.97 across the seven
(`2026-10-05-promotion-overlap-measure`). Nothing records which was intended per
label, so no measure derived from label shape alone is trustworthy. `D-02` is
built around this. Any further round should state which to draw.

**Promotion can still lose fields CDL merges.** Where CDL merges a real field
with a neighbour, the merged polygon may satisfy neither `D-02` condition and
the field is lost.

**Skips are not random.** Skip rate ranges 2.0% to 22.5% across labelers on
randomly dealt queues (`A-04`, refuted). The surviving positives are therefore
the easier cases, and measured performance is optimistic by an unquantified
amount.

**Negatives may contain trusses.** Truss detection during the negative pass
ranged 5.0 to 0.0 per 100 fields reviewed, implying 1-3% of the 933 negatives
carry one undetected (`2026-09-17-negative-pass-rejections`). The legacy-map
backstop cannot catch them: by construction these are fields the legacy map
omits.

**Temporal ambiguity.** The NAIP mosaic spans 2021–2023 and different fields are
observed in different years; mosaic composition across that window was not
explicitly controlled. A truss installed or removed mid-window has no
unambiguous label, and the imagery date for a given field is not currently
recorded alongside its label.

**The crop-consensus requirement excludes land.** Requiring a pixel to be
cropland in all three years removes fields that rotated into fallow, pasture, or
any non-crop class during the window. Irrigated fields are not exempt from
rotation, so some are excluded.

**The 1-hectare floor excludes small fields.** Maryland farms are smaller than
the national average, and the research proposal identifies coarse resolution as
the specific failure of prior national irrigation mapping in this state. A floor
set for CDL's 30 m resolution may be discarding exactly the fields that
distinguish this work.

**Ground truth is imagery interpretation.** Every label reflects what a person
believed they saw in aerial imagery, not a field measurement or a farmer's
confirmation. The farmer surveys are the intended check on this.
