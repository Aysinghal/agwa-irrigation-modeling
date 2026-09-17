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
backstop against mislabeled negatives. **It is incomplete**: 19 truss-bearing
fields surfaced in the negative queue, which is drawn only from fields no
hand-drawn label touches, so a truss reaching it is one the legacy map never
recorded (`2026-09-17-negative-pass-rejections`). This bounds both roles — it
cannot seed the positives it does not contain, and it cannot backstop against
them either.

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

Those hand-drawn polygons are not the training positives. To convert them onto
consistent geometry, hand-drawn labels were rasterized at 10 m and the
**overlap ratio** — the fraction of a CDL field's area covered by hand-drawn
label — was computed for every field they touched. The distribution is bimodal:
a cluster of small slivers where a label barely clips a neighboring field, and a
cluster of near-complete matches. The threshold was set at **0.65**, in the
valley between them. Fields at or above it become **positive fields**, class 1.

## How negative labels were made

Any CDL field touching a hand-drawn label *at all* — including slivers well
below the promotion threshold — was placed in the **exclusion set**. Negatives
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

**Partly measured.** The labels are exported and backed up
(`2026-09-15-labeler-skip-rate-heterogeneity`), so the counts of human decisions
are known. Field counts are not, because promotion sits between the two.

What is known:

| | count |
|---|---|
| Hand-drawn positive polygons | 693 |
| Positive points skipped | 87 |
| Confirmed negative fields | 947 |
| Negative candidates rejected | 53 |

The positive target was 700 — 100 per labeler. One labeler exhausted a full
120-point queue at a 22.5% skip rate without reaching 100.

Three qualifications on the negative count. One confirmed negative
(`field_450`) has a progress marker but no label asset, lost to a partially
failed batch export. One (`field_343`) was rejected and then confirmed eight
minutes later with a note reading "not a land", and is currently class 0. And
19 of the 53 rejections were rejected *because a truss was visible*
(`2026-09-17-negative-pass-rejections`); those fields are in neither class.

**What promotion still hides.** 693 hand-drawn polygons do not yield 693
positive fields. Each is promoted onto whatever CDL fields it overlaps by at
least the threshold, which can be several fields or none, so the positive field
count is a separate number and remains unmeasured.

Counts cannot be derived from the assignment design, because the pipeline
transforms them at two points: promotion keeps only fields at or above the
overlap threshold, and the backstop drops negatives overlapping the legacy map.
The assignment targets — 100 positive points per labeler, 1000 negative
candidates weighted across labelers — bound the result from above but do not
determine it.

What still needs measuring:

- Positive and negative **field** counts, and the resulting class ratio
- Geographic distribution of each class, by county and by physiographic region
- Field area distribution, and crop class composition, per class

These numbers will be filled in from a research-log entry that records the
measurement.

## Known biases and limitations

**Positives are Eastern Shore; negatives are statewide.** The legacy truss map
covers the Mid-Atlantic — effectively the Eastern Shore in Maryland — so every
positive comes from there. The one exception proves the constraint is the
sampling frame rather than the geography: 19 truss-bearing fields were found
during the negative pass, which drew uniformly from statewide CDL fields, and
those are the only positives the project has collected by a process that does
not inherit the legacy map's footprint. They were discarded rather than promoted
(`2026-09-17-negative-pass-rejections`). Negatives were drawn from CDL fields across the whole
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

**Promotion favors fields CDL represents well.** A hand-drawn label only
produces a positive if some CDL field overlaps it by 65% or more. Where CDL
fragments a real field into pieces, or merges it with a neighbor, no piece
clears the threshold and the field is lost. Positives are therefore biased
toward fields whose true boundaries the CDL happens to capture cleanly.

**Skips are not random.** Labelers skipped points they found unusable, and skip
rate ranges from 2.0% to 22.5% across the seven of them on queues dealt at
random from one shuffled pool (`2026-09-15-labeler-skip-rate-heterogeneity`).
Difficulty did drive those decisions, so the surviving positives are
systematically the easier cases and measured performance is optimistic relative
to production by an amount not yet quantified. `A-04` is refuted.

**Negatives may contain trusses.** Labelers caught 19 truss-bearing fields in
the negative queue, at rates from 5.0 to 0.0 per 100 reviewed. The spread implies
some were missed — on the order of 1-3% of the 947 confirmed negatives, though
the estimate is underpowered. The automated backstop cannot correct this: it
drops negatives overlapping the legacy truss map, and these are by construction
fields the legacy map does not contain
(`2026-09-17-negative-pass-rejections`).

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
