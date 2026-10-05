# Evaluation

How the model is judged: what it is measured on, how the data is split, which
metrics are reported, and what would count as good enough.

## Preregistration

This file is written before results exist, and that is the point of it.
Committing to how the model will be judged before seeing how it performs removes
the freedom to pick, afterwards, whichever measure happens to flatter the
outcome.

Revising it is allowed. Revising it silently is not. Any change made once
results are visible is recorded in a research-log entry stating what changed,
why, and what the previous version said. A reader can then tell which choices
predate the results and which followed them.

## Evaluation population

The Coastal Plain population defined in `problem-statement.md`. Statewide
auxiliary data may appear in training experiments, but is never the reporting
population.

Prevalence is load-bearing throughout. The labeled dataset is close to balanced
by construction, while irrigated fields are a small minority of Coastal Plain
CDL fields. Any metric sensitive to prevalence must state which prevalence it
assumes.

### Label defects bound every number reported here

Two defects recorded in `data.md` sit underneath every metric below and are not
correctable here: positives are systematically easier than the population
(`A-04`, refuted), and a small share of negatives carry an undetected truss.

They push scores in opposite directions. Easier positives inflate recall; hidden
trusses turn correct detections into apparent false positives and deflate
precision. Neither shifts with the choice of metric, split, or threshold, so
both are stated alongside results rather than corrected for. `Q-05` would size
them.

## Splits

The requirements below are fixed. The specific partitioning scheme that
satisfies them is open (`Q-09`).

### Group by originating label

One physical center pivot produces one hand-drawn label, which can promote more
than one CDL field wherever CDL fragments the field beneath it. Such fields
contain the same pivot, the same crop, and imagery from the same acquisition.
Putting one in training and another in test measures memorisation rather than
generalisation.

Every field tracing back to the same hand-drawn label is therefore assigned to
the same side of every split. This is a distinct requirement from spatial
blocking and is not satisfied by it.

### Block spatially

Nearby fields share soil, weather, sun angle, imagery flight date, crop, farm
operator, and local conventions of field shape. Interleaving training and test
fields lets a model score well by recognising the neighbourhood rather than the
target — leakage, as defined in `glossary.md`.

Splits therefore assign contiguous blocks whole. Individual fields are never
assigned independently.

### Preserve class balance across folds

Positives are confined to the Eastern Shore (`data.md`). A spatial partition
drawn without regard to class can produce a fold containing no positives at all,
which measures nothing, or one holding nearly all of them. Every fold must
contain both classes in workable proportion, and the realised balance of each
fold is reported alongside its results.

### Freeze the test set

The test split is fixed before modelling begins and evaluated once, at the end.
All tuning, model selection, and threshold setting happen on validation data.

Each additional look at test performance followed by a change leaks information
through the decisions that look prompted, and that leakage does not show up
anywhere in the final number.

### Report spread, not a point

At this dataset size (`data.md`) any single test partition is small enough
that one number is dominated by which fields happened to land in it. Results are reported
as a mean and a spread across spatial cross-validation folds.

## Metrics

Precision and recall are defined in `glossary.md`.

### Ranking quality

**PR-AUC** is the primary summary. It plots precision against recall, so its
denominator is what the model flagged. When positives are rare, this is what a
user actually experiences: a model can miss most of its errors under other
measures and still put a map in front of someone where most flagged fields are
wrong.

**ROC-AUC** is reported secondarily. It plots recall against the false positive
rate, whose denominator is all true negatives. When negatives greatly outnumber
positives, a large absolute number of false positives barely moves it, so a
model can look excellent while its flags are mostly wrong.

### The prevalence problem

These two behave differently under a shift in class balance, and our situation
guarantees such a shift.

ROC-AUC is invariant to prevalence, which makes it comparable across datasets
but means it does not describe what a user encounters. PR-AUC does describe
that, but only at the prevalence of the set it was computed on — and our labeled
data is roughly balanced while the applied population is not. A PR-AUC computed
on a balanced test set is therefore optimistic in exactly the way it is meant to
guard against.

Two consequences, both binding:

- Every precision figure states the prevalence it assumes.
- Precision is additionally estimated at production prevalence, either by
  evaluating on a set sampled to match it or by adjusting analytically from
  known prevalence. This estimate, not the balanced one, is what the scientific
  bar in `problem-statement.md` is judged against.

### Calibration

`model.md` retains probabilities rather than hard classes because downstream use
aggregates them. That makes calibration a first-class metric here rather than a
diagnostic.

Calibration asks whether fields scored 0.7 are irrigated about 70% of the time.
A model can rank every field correctly and still be badly calibrated, and the
error is invisible to every metric above. It is not invisible downstream: a
hundred fields each scored 0.5 sum to fifty expected irrigated fields, and if
only twenty truly are, the aggregate is wrong by a factor of two and a half
while classification looks fine.

Reported as a reliability curve and a Brier score.

### Area-weighted variants

Per-field precision and recall count a one-hectare field and a fifty-hectare
field equally. Water use does not, and the downstream bar in
`problem-statement.md` is about water.

Precision and recall are therefore reported in both forms: per-field, which
supports the scientific claim, and area-weighted, which supports the downstream
one. They can diverge, and a divergence is itself informative — a model that is
accurate per field but poor by area is systematically wrong about large fields.

## Baselines

**Trivial.** Majority class and random ranking. These establish the floor and
catch evaluation bugs; a model that fails to beat them cleanly indicates a
broken pipeline rather than a hard problem.

**Simple heuristic.** Thresholding on a vegetation index or on field shape. The
research proposal notes that vegetation indices alone overestimate irrigation,
so this is expected to have high recall and poor precision — which is itself a
useful reference point.

**Field area.** Area alone reaches ROC-AUC 0.763 and PR-AUC 0.781 on the
labeled set, floor 0.486 (`2026-10-05-field-area-baseline`). The demanding
floor: field size is measurable from a cropped chip without resolving any
structure, so a model scoring near it has not shown it can see a truss. Added
after the measurement rather than before, per Preregistration.

**Whole-field classifier.** The alternative framing in `Q-06`. It doubles as
both a candidate approach and a baseline: if the MIL model cannot beat a resized
whole-field CNN, its extra complexity is unjustified.

**USGS 2019 national irrigation map.** The independent external comparison, and
the one the scientific bar in `problem-statement.md` refers to. Its resolution
is coarse for Maryland field sizes, which is the specific weakness this work
claims to address, so the comparison must be made at field level rather than by
aggregate area.

### The legacy truss map is not a clean baseline

It is an existing irrigation map, so it looks like an obvious comparison. It is
not, because our positive labels were seeded from it (`data.md`). Measuring
against it largely measures how faithfully we reproduce the source of our own
labels, and high agreement would be evidence of circularity rather than of
quality.

It is still worth reporting, as an agreement check and as the basis for the
change estimate in `A-13`. It is not counted as a baseline beaten.

## Success thresholds

`problem-statement.md` states the bars qualitatively. This section makes them
measurable.

Absolute numeric targets are **not set yet**, and setting them before any
baseline exists would be guessing. The rules below are relative and binding now;
absolute figures are fixed once the first baseline result exists, and the
research-log entry that sets them records that they were set at that point
rather than in advance.

1. **Beat the best non-trivial baseline** on PR-AUC at production prevalence, by
   a margin larger than the spread across folds. A gain smaller than the noise
   is not a gain.
2. **Beat the USGS 2019 map** on Coastal Plain fields, at field level, on both
   precision and recall at the chosen operating point.
3. **Be calibrated well enough to aggregate.** The tolerance follows from what
   the salinization model needs and depends on `A-12`, which is unresolved.
4. **Answer RQ3.** A quantified estimate of irrigation missed because it is not
   center-pivot, with stated uncertainty. Required regardless of the other three
   (`problem-statement.md`).

## Reporting requirements

Any result entering the research log states:

- Which split scheme and which fold
- Random seed and the code commit it ran at
- Class balance of the evaluation fold
- The prevalence assumed by any precision figure
- Spread across folds, not only the mean

Runs that did not work are reported on the same terms. Selectively reporting
only successful configurations turns a set of honest experiments into a
misleading result, and with the number of ablations this project implies, some
will look good by chance alone.
