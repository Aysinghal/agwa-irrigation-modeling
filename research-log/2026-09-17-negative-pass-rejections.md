# The negative pass rejected trusses and non-cropland, and kept neither

## Question

What did labelers reject during the negative pass, and what does that say about
the negative set?

## Hypothesis

None was stated in advance. This came out of reading the export, not from a
planned test, and is recorded that way.

The pipeline's design implies an answer. `gee/labeling/promote_positives.js`
builds an exclusion set from every CDL field a hand-drawn label touches at all,
and negative candidates are drawn only from outside it. The intent is that
truss-bearing fields cannot reach the negative queue, so rejections should be a
small homogeneous category of unusable candidates — bad imagery, a polygon that
is not a field. Trusses appearing in the queue was not anticipated.

## Setup

Data: `data/raw/backup_negative_progress.csv`, 1001 progress markers of which 53
are rejections, exported from the `progress_negative/<user>/` trees by
`gee/export/backup_all_labels.js`. Commit `3c91253`.

All 53 free-text reasons were read. Each was placed in one of two categories by
matching `truss|pivot|circular irrigation` against the note, then the assignment
was checked by hand. Per-labeler rates were tested against a single pooled rate
with a chi-square test of homogeneity, on the same randomized-assignment
argument used in `2026-09-15-labeler-skip-rate-heterogeneity`.

## What happened

The 53 rejections split cleanly into two categories with nothing left over.

**A field carrying a visible truss — 19 of 1001 candidates (1.9%).** Thirteen
describe a truss on the field itself: "pivot arm", "truss on field", "Circular
irrigation truss", "truss lines". Six describe a truss at or beyond the
boundary: "truss on edge", "truss on neighboring field", "part of larger field
with pivot", "overlaps with truss", "Touching a field with circular
irrigation", "unsure if truss on side".

**A polygon that is not agricultural cropland — 34 of 1001 (3.4%).** Written as
"House" (three times), "Structures", "Woods", "solar farm?", "soccer field",
"Roads, house", "Only ~30% cropland", "<50% cropland", "not a field" (five
times), and one "bob ross (seriously)".

Truss rejections per 100 candidates reviewed:

| labeler | queue | truss rejects | per 100 |
|---|---|---|---|
| ayush | 40 | 2 | 5.0 |
| mike | 120 | 6 | 5.0 |
| sienna | 120 | 4 | 3.3 |
| maddie | 200 | 3 | 1.5 |
| taryn | 200 | 2 | 1.0 |
| tien | 201 | 2 | 1.0 |
| mara | 120 | 0 | 0.0 |

Chi-square 13.8 on 6 degrees of freedom, p ≈ 0.03. Expected counts are below 5
in every cell, so the test is unreliable and the result is suggestive only.

All 53 rejected fields carry full polygon geometry in the export. A rejection
writes a progress marker but no label asset, so none of these 53 are in the
negative set, and none are in the positive set either.

## Interpretation

The two categories are unrelated problems that happen to share a field.

**The 19 are positives, and they were discarded.** They are confirmed by eye to
carry a truss, and they are in neither class. More than that, they are the most
valuable positives the project could have obtained. Every positive currently in
the dataset was seeded from the legacy truss map, which is why positives are
confined to the Eastern Shore — the defect `data.md` calls the most serious in
the dataset. These 19 came from a uniform random draw over statewide CDL fields.
They are the only positives collected by a process that does not inherit the
legacy map's geography.

Their existence also establishes something no other step could: fields carrying
visible trusses exist outside the legacy truss map. The exclusion set is built
from hand-drawn labels, which are built from legacy map points, so a truss the
legacy map never recorded has nothing keeping it out of the negative queue. The
legacy map is incomplete, and now there is direct evidence rather than an
expectation.

**The negative set is probably contaminated.** Detection ranged from 5.0 per 100
to 0.0 per 100 on randomly assigned queues. If the higher rates are closer to
truth, the pooled 1.9% caught means trusses were missed; the arithmetic puts the
miss somewhere between roughly 10 and 30 fields out of 1001, depending on
whether the high-rate labelers were accurate or over-calling. That is 1-3% of
the 947 confirmed negatives labeled 0 while carrying a truss. The legacy-map
backstop in `merge_training_set.js` does not catch them, because by construction
these are the fields the legacy map does not have. The spread is underpowered
and cannot distinguish a genuine detection difference from noise, but the
direction is not in doubt: some were found, so some were missable.

**The 34 measure `A-05` directly.** Its stated test is the tightness of the
overlap-ratio distribution. This is a more direct route to the same question: on
a random draw of 1001 CDL polygons, 3.4% are houses, woods, roads, solar farms
or sports pitches rather than agricultural fields. Rejection was discretionary
and rejection rates themselves varied, so 3.4% is a lower bound. This rate
applies to every field scored at inference, not only to training candidates.

**`A-09` is not affected.** It concerns fields irrigated by means that leave
nothing visible — linear-move, drip. These 19 carry visible trusses that people
saw and rejected. The failure is one of label handling, not of undetectable
irrigation, and it belongs to `A-03`.

## What this changes

- `A-05` — status `untested` becomes `refuted`, citing this entry. 3.4% of
  randomly drawn CDL polygons are not agricultural fields, as a lower bound.
- `A-03` — a second line of evidence, independent of the skip result. Truss
  detection on identical random queues ranged from 5.0 to 0.0 per 100.
- `data.md` — three additions. Nineteen confirmed-by-eye positives exist outside
  both classes and are recoverable from the export. The negative set carries an
  estimated 1-3% truss contamination that the legacy-map backstop cannot catch.
  The "Positives are Eastern Shore" limitation gains the note that the only
  statewide-sampled positives found so far were discarded.
- `data.md`, source datasets — the legacy truss map is demonstrably incomplete.
  Currently described only as a pre-existing inventory.
- `A-09` — explicitly unaffected, recorded here so the finding is not
  miscategorised later.

Spec edits are not made in this commit; they go through review per
`spec/README.md`.

## Next

Recover the 19 first. They are identified by `field_id` in the export and carry
their geometry, so no new labeling is needed. Thirteen describe a truss on the
field itself and are positives on the same standard as every other positive in
the dataset. The remaining six describe a truss at or beyond the boundary, which
is the situation `Q-03` already governs, and they should be routed there rather
than decided separately.

Then decide whether to re-review the 947 confirmed negatives for missed trusses.
A full re-review is expensive and duplicates the inter-rater round `Q-05`
proposes. A cheaper version: have one labeler with a high detection rate review
a sample of the fields confirmed by a labeler with a low one, which measures the
contamination rate without re-reviewing everything.
