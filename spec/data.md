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

Those hand-drawn polygons are not the training positives. Converting them onto
consistent geometry needs a rule for which CDL fields a label promotes, and
that rule is `D-02`: a field becomes a **positive field**, class 1, if at least
0.15 of the label falls inside it, or at least 0.65 of it lies under the label.
A field satisfying neither is a sliver and enters the excluded band (`Q-03`).

Two measures rather than one because the labels are inconsistent about what
they trace — see the limitation below — so either measure used alone discards a
different group of genuinely irrigated fields.

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

Measured. `scripts/build_label_table.py` rebuilds the table from the exports
and reports these; `2026-10-05-promotion-overlap-measure` records the run.

| | count |
|---|---|
| CDL fields in Maryland | 37,523 |
| **Positive fields** | **881** |
| — from the legacy seed | 868 |
| — recovered from negative-pass rejections | 13 |
| **Negative fields** | **933** |
| Excluded band | 582 |
| Class ratio | 1 : 1.06 |
| Prevalence if applied to all CDL fields | 2.35% |

Positives divide by which promotion condition fired: 246 on label share alone,
215 on field coverage alone, 407 on both. The two groups caught by one
condition only are the large and the small fields respectively, and a single
measure would have dropped one or the other.

Underlying human decisions: 693 hand-drawn positive polygons from 780 points
viewed, so 87 skips; 947 confirmed negatives and 53 rejections from 1000
candidates, with 14 of the confirmed negatives then dropped by the legacy-map
backstop. The positive target was 700, and one labeler exhausted a full
120-point queue at a 22.5% skip rate without reaching 100.

The 881 positives trace to 635 distinct hand-drawn labels, since CDL fragments
some fields and one label can promote several. That grouping is what the split
requirement in `evaluation.md` acts on.

Two repairs are applied: `field_343` is dropped, having been rejected and then
confirmed eight minutes later with a note reading "not a land", and `field_450`
is restored from its progress marker after a partially failed batch export lost
its label asset.

Field areas differ sharply by class. The median CDL field is 4.0 ha; the median
positive is substantially larger, which is a confound in its own right and is
recorded below.

What still needs measuring:

- Geographic distribution of each class, by county and by physiographic region
- Crop class composition, per class

## Known biases and limitations

**Positives are Eastern Shore; negatives are statewide.** The legacy truss map
covers the Mid-Atlantic — effectively the Eastern Shore in Maryland — so every
positive comes from there. The one exception proves the constraint is the
sampling frame rather than the geography: 19 truss-bearing fields were found
during the negative pass, which drew uniformly from statewide CDL fields, and
those are the only positives the project has collected by a process that does
not inherit the legacy map's footprint. Thirteen are now promoted and tagged
`negative_pass` so they stay distinguishable; the remaining six describe a truss
at the boundary and sit with `Q-03`
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

**Positives are far larger than negatives.** Median positive field 23.7 ha
against 3.7 ha for negatives, a factor of 6.4, where the CDL population median
is 4.0 ha — so the negatives carry the population's size distribution and the
positives do not. Area alone reaches ROC-AUC 0.763 on the labeled set
(`2026-10-05-field-area-baseline`). The separation is real, since a center pivot
needs a large field, but it means a model can learn size instead of structure,
and `evaluation.md` carries area as a baseline accordingly. `D-02` widened the
gap by recovering large fields the superseded rule discarded.

**The labeling protocol was ambiguous and labelers diverged.** The instruction
above asks for a polygon around the whole field. Median hand-drawn area over
field area runs from 0.60 to 0.97 by labeler, overall median 0.78, which is
what a circle inscribed in a square covers: most people traced the pivot rather
than the field. `D-02` tolerates either, but the labels do not record which was
intended in any given case, so no measure derived from label shape alone can be
trusted. Any further labeling round should state which to draw
(`2026-10-05-promotion-overlap-measure`).

**Promotion can still lose fields CDL fragments.** A label is promoted onto
whatever CDL fields satisfy either condition in `D-02`. Where CDL merges a real
field with a neighbour, the merged polygon may satisfy neither, and the field is
lost. This is narrower than the failure the single-threshold rule had, but it is
not eliminated.

**Skips are not random.** Labelers skipped points they found unusable, and skip
rate ranges from 2.0% to 22.5% across the seven of them on queues dealt at
random from one shuffled pool (`2026-09-15-labeler-skip-rate-heterogeneity`).
Difficulty did drive those decisions, so the surviving positives are
systematically the easier cases and measured performance is optimistic relative
to production by an amount not yet quantified. `A-04` is refuted.

**Negatives may contain trusses.** Labelers caught 19 truss-bearing fields in
the negative queue, at rates from 5.0 to 0.0 per 100 reviewed. The spread implies
some were missed — on the order of 1-3% of the 933 negatives retained, though
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
