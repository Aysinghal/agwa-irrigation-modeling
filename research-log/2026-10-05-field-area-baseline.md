# Field area alone separates the classes

## Question

Does field area, with no imagery, predict whether a field is irrigated?

## Hypothesis

None stated in advance. The question arose from noticing that the fields
`D-02` recovered were the largest ones.

## Setup

`data/labels.csv` at commit `d8fa696`: 881 positive and 933 negative fields,
base rate 0.486. Area is the geodesic `area_m2` Earth Engine computed. Ranking
by area descending, scored as a classifier would be.

## What happened

| | median area |
|---|---|
| Positive fields | 23.7 ha |
| Negative fields | 3.7 ha |
| All CDL fields in Maryland | 4.0 ha |

As a ranker on the labeled set:

| | |
|---|---|
| ROC-AUC | **0.763** |
| PR-AUC | **0.781** (floor 0.486) |

Operating points:

| flag if ≥ | recall | precision |
|---|---|---|
| 10 ha | 0.69 | 0.741 |
| 20 ha | 0.55 | 0.825 |
| 50 ha | 0.26 | 0.893 |

The negative median matches the CDL population median almost exactly, 3.7
against 4.0 ha, which is what uniform sampling should produce.

## Interpretation

The separation is real rather than an artifact of how the classes were drawn.
Negatives came from a uniform draw over CDL fields and have the population's
size distribution; positives are large because a center pivot needs a large
field to be worth installing. Area is genuinely informative about irrigation.

That makes it a baseline rather than a leak, and a demanding one. Any model
consuming imagery has to beat 0.763 ROC-AUC and 0.781 PR-AUC, and a model
scoring near those numbers has demonstrated nothing about whether it can see a
truss — it may have learned to measure field size, which it can do from a
cropped chip without resolving any structure at all.

This gives the ablation `A-15` and `A-17` both need: compare the model against
area alone, and against area supplied as an explicit feature. If adding imagery
to area does not improve on area, the imagery is contributing nothing.

The numbers above are computed at the labeled set's balance of 0.486. At the
2.35% production prevalence in `data.md` the precision figures fall sharply,
and the comparison against any model must be made at the same prevalence for
either to mean anything.

`D-02` widened this gap by recovering large fields the superseded rule
discarded. Those fields are irrigated, so the recovery was correct, but the
confound it strengthens is the one recorded here.

## What this changes

- `evaluation.md` — the simple-heuristic baseline names a vegetation index and
  field shape, not field size. Area belongs there, with these numbers as the
  figure to beat. Recording this addition satisfies the preregistration rule in
  that file, since it is being added after seeing data.
- `data.md` — the size limitation can cite this entry rather than stating the
  medians unsupported.

## Next

Nothing immediately. The baseline is cheap to re-run and belongs in the
benchmark harness as a registered baseline when that exists, alongside majority
class and random ranking.
