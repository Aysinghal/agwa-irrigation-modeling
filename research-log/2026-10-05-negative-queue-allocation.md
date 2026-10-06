# Unequal negative queues understated the contamination rate

## Question

Did the negative pass's unequal queue sizes affect the truss contamination
estimate?

## Hypothesis

None stated in advance. The question came out of choosing per-labeler weights
for round 2, not from a planned test.

Had it been asked beforehand: queue size was set by a workload argument, before
anyone had seen a detection rate, so the two should be independent and the
pooled rate should be unbiased.

## Setup

Data: `data/raw/backup_negative_progress.csv`, 1001 markers, unchanged since
commit `3c91253`. Read at commit `a8d3653`.

Rejections were classified as truss-related by matching `truss|pivot|circular
irrigation` against the note, the same rule
`2026-09-17-negative-pass-rejections` used and that `build_label_table.py`
implements. Two rates were computed over the same 19 detections: the pooled rate
(detections over candidates, which weights each labeler by queue size) and the
mean of the per-labeler rates (which weights each labeler equally).

## What happened

| labeler | queue | trusses found | per 100 |
|---|---|---|---|
| ayush | 40 | 2 | 5.0 |
| mike | 120 | 6 | 5.0 |
| sienna | 120 | 4 | 3.3 |
| maddie | 200 | 3 | 1.5 |
| taryn | 200 | 2 | 1.0 |
| tien | 201 | 2 | 1.0 |
| mara | 120 | 0 | 0.0 |

Queue size runs opposite to detection rate. The three labelers at or above 3.0
per 100 hold 280 of the 1001 candidates between them; the four below hold 721.

Pooled rate **1.90** per 100. Equal-weighted mean of the per-labeler rates
**2.40** per 100.

Taking mike's 5.0 per 100 as a reference — the highest rate measured on a queue
large enough to be worth quoting — and assuming each labeler missed the
difference between their rate and his on their own queue, the implied number of
trusses left in the negative set is **31**. Under an equal split of the same
1001 candidates it would be **26**.

## Interpretation

The pooled rate is a queue-size-weighted average, so it is dominated by the four
labelers who found the fewest trusses. Weighting the same seven people equally
moves it from 1.90 to 2.40 per 100, about a quarter higher. The allocation was
set before any detection rate existed, so this is accidental rather than
anybody's choice, but the direction is not ambiguous: the people who found
trusses were given the smallest queues.

The effect on the dataset is small. Five fields out of 933, against an estimate
whose own range spans tens. The effect on the measurement is the real cost, and
it is the one `2026-09-17-negative-pass-rejections` already recorded when it
reported expected counts below 5 in every cell. Forty candidates cannot measure
a rate of a few per cent at all, so the test that would have distinguished a
genuine detection difference from noise was unavailable, and still is.

What this does not establish is which direction the error runs. mara found 0 in
120 and mike found 6 in 120, on queues drawn from the same pool. Either mara
missed six trusses or mike called six fields that do not have one, and nothing
in the export separates those. Treating the highest rate as the reference
assumes the first, which is why 31 is an estimate rather than a count.

## What this changes

- `data.md` — the negative contamination figure is understated by the
  allocation, and the equal-weighted rate belongs alongside the pooled one. The
  limitation can cite a cause rather than describing the spread alone.
- `D-03` — round 2 splits evenly across labelers rather than by workload weight.
  `scripts/build_review_queues.py` implements it and cites this entry.
- `A-03` — unchanged. The detection spread was already recorded in
  `2026-09-17-negative-pass-rejections`; this entry reanalyses the same 19
  detections and adds no independent evidence of disagreement.

Spec edits are not made in this commit; they go through review per
`spec/README.md`.

## Next

Round 2's even split gives the homogeneity test the power it lacked, on queues
of 435 to 448 rather than 40 to 201. That settles whether the detection spread
is real.

It does not settle whether the high-rate labelers are more sensitive or simply
over-calling. Only a field check does, which puts it with `A-01` and `A-02`
behind the farmer surveys.
