# Labeler skip rates are not homogeneous

## Question

Does the skip record support `A-04`?

## Hypothesis

None was stated in advance. This was found while verifying the label export,
not tested deliberately, and that is recorded here rather than dressed up.

Had it been asked beforehand, `A-04` implies skip rate is a property of the
assigned points rather than of the labeler. Points were assigned by a global
shuffle under seed 42 followed by round-robin dealing
(`gee/labeling/datapoint_assignment.js`), so every queue is a uniform random
sample of the same pool and the difficulty distribution is identical across
labelers by construction. Under `A-04`, observed rates should therefore differ
only by sampling noise.

## Setup

Data: `data/raw/backup_positive_progress.csv`, 780 progress markers, exported
from the `progress/<user>/` asset trees by `gee/export/backup_all_labels.js`.
Commit `3c91253`.

Two things were measured. First, skip rate per labeler, tested against a single
pooled rate with a chi-square test of homogeneity. Second, the free-text reason
on all 87 skips, read directly — the test `A-04` itself prescribes.

## What happened

Skips by labeler, out of markers written:

| labeler | skipped | total | rate |
|---|---|---|---|
| taryn | 2 | 102 | 2.0% |
| maddie | 7 | 107 | 6.5% |
| sienna | 7 | 107 | 6.5% |
| mike | 11 | 111 | 9.9% |
| ayush | 15 | 115 | 13.0% |
| mara | 18 | 118 | 15.3% |
| tien | 27 | 120 | 22.5% |

Pooled rate 11.15%. Chi-square 31.5 on 6 degrees of freedom, **p = 2.1×10⁻⁵**.

All 87 skips carry a non-empty reason. The overwhelming majority state that no
truss was visible — "no truss", "No sign of truss, no circle lines", "no truss,
replaced with small lake", "solar farm". Two labelers wrote reasons that name
their own uncertainty rather than the scene: mara recorded "unsure if truss" and
mike recorded "couldn't find truss".

tien wrote markers for all 120 assigned points — the full 100 target plus the
entire 20-point reserve — and finished with 93 labels. Every other labeler
reached 100 without exhausting their reserve. The hand-drawn positive set
therefore holds 693 polygons rather than the 700 the assignment targeted. How
many CDL fields those promote to is a different number and is not measured here.

Reject rates on the negative queue span 2.5% to 10.0% across the same seven
people, on 1001 markers.

## Interpretation

The reasons and the rates say different things, and both are load-bearing.

Read on their own, the reasons support `A-04`. Almost all of them describe the
scene rather than the labeler's difficulty: no truss present, a solar farm, a
lake. That is the intended use of a skip.

The rates contradict that reading. Assignment was randomized, so an 11-fold
spread cannot come from the points; it can only come from where each person set
their threshold. "No truss" is not an observation when a truss is faint — it is
a judgment, and these seven people made it differently. The two written
admissions of uncertainty are the same effect surfacing in the text.

The consequence is the one `A-04` names. A point tien skipped is one taryn would
more likely have labeled, and under random assignment roughly 13% of tien's
queue falls in that gap. Those are the marginal pivots. They are absent from the
positive set, and which of them survived depended on who drew the point rather
than on what was in the image.

This does not make the positives wrong. It makes them easier than the
population, by an amount currently unmeasured, and it makes label quality
labeler-dependent in a way `A-03` assumes it is not.

## What this changes

- `A-04` — status `untested` becomes `refuted`, citing this entry. The literal
  claim about reasons survives; the consequence the assumption was protecting
  against does not.
- `A-03` — unchanged in status, but this is indirect evidence against it. Seven
  people diverging on the skip decision are unlikely to agree perfectly on the
  label decision.
- `data.md` — the composition section takes 693 as the hand-drawn positive label
  count; the positive *field* count stays unmeasured, since promotion transforms
  one into the other. The "Skips are not random" limitation can cite a
  measurement rather than a worry.
- `Q-05` — the case for an inter-rater round strengthens. The question asked
  whether the resulting number would change anything; there is now a specific
  quantity it would inform.
- `evaluation.md` — reported performance is optimistic relative to production by
  an unquantified amount. This is a caveat on every number the project produces,
  not a metric change.

Spec edits are not made in this commit; they go through review per
`spec/README.md`.

## Next

Two things, in order.

Measure the gap rather than assert it. The 87 skipped points are identified in
the export and their imagery is unchanged. Re-labeling them under one labeler,
or having several people label the same subset, converts "optimistic by an
unknown amount" into a number. This overlaps almost entirely with `Q-05`, which
makes the combined round cheaper than either alone.

Then decide whether skip-rate divergence warrants weighting or excluding any
labeler's contribution. Probably not — the effect is on which points became
positives, not on whether the drawn polygons are correct — but it should be
decided rather than left implicit.
