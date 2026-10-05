# Promotion measured field shape, not irrigation

## Question

Why does a local reimplementation of positive promotion disagree with the
Earth Engine one?

## Hypothesis

None stated in advance. A handful of fields were expected to differ near the
threshold, exact polygon intersection against a 10 m raster.

## Setup

`scripts/build_label_table.py` at commit `b3eee1f`, against the exports in
`data/raw/`. Overlap by exact intersection in planar degrees, compared with
`cdl_fields_positive_md_2022` and the ratios stored on
`cdl_fields_excluded_md_2022`.

## What happened

The first run reproduced 588 of Earth Engine's 714 positives and added none.
One-directional disagreement, not boundary noise.

Two causes, both measurable.

**Earth Engine's ratios are inflated.** `promote_positives.js` converts a pixel
count to area as `pixels * 100 m2`. 568 of 1444 fields carry a
`raw_overlap_ratio` above 1.0, which no intersection can produce, piling up at
1.25-1.29. `1/cos(38.5 deg) = 1.28`. The stored `overlap_ratio` is capped at
0.9999, which hides it. The threshold that was applied in practice is about
0.48 of true coverage, not 0.65.

**Labelers drew different things.** Hand-drawn blob area over field area, by
labeler:

| ayush | sienna | tien | mara | taryn | mike | maddie |
|---|---|---|---|---|---|---|
| 0.60 | 0.61 | 0.65 | 0.73 | 0.76 | 0.88 | 0.97 |

Overall median 0.78. A circle inscribed in a square covers 0.79.

After correcting both, the two rules disagree in opposite directions:

| dropped by | n | median area | blob share | field coverage |
|---|---|---|---|---|
| field coverage | 174 | 69.8 ha | 0.94 | 0.33 |
| blob share | 235 | 2.0 ha | 0.04 | 0.97 |

The corrected field-coverage distribution has no valley: 463 fields below 0.10,
485 between 0.10 and 0.85, 496 above 0.85, and the middle is flat at 32.3 per
bin with a standard deviation of 5.8 against Poisson noise of 5.7.

Blob share does have one. Of 1976 label-field pairs, 1005 fall below 0.05 and
the count drops to 45 by 0.15.

## Interpretation

Dividing by field area asks what fraction of the field lies under the blob,
which for a circle on a rectangle is a function of the rectangle's
proportions. A circle fills 79% of a square and 39% of a 2:1 rectangle, so
elongated fields failed the threshold whether or not they carried a pivot.
That is why the borderline fields were three times the median size, and it
means the promotion step has been partly a shape filter.

Dividing by blob area asks which field the pivot is on, which is what the
labeler judged. It fails the mirror case: a small field wholly beneath a large
blob is a negligible share of it.

Neither measure is wrong about the fields it keeps. Each is wrong about the
fields the other keeps, and both groups are irrigated. The valley argument
recorded in `data.md` does not survive either: the flat middle holds as many
fields as each peak, and reads as a valley only because the peaks are narrow.

`A-05` is unaffected by this. CDL boundaries are not the problem here; the
measure applied to them was.

## What this changes

- `D-02` records the replacement rule and supersedes the 0.65 field-coverage
  threshold.
- `A-10` stays refuted. The band is 576 fields under the new rule, down from
  730, and now fails both measures rather than one shape-dependent one.
- `data.md` — the bimodal-valley justification, the 0.65 threshold, the
  composition counts, and the "promotion favors fields CDL represents well"
  limitation. A new limitation: the labeling protocol asked for the field
  outline and most labelers drew the pivot circle.
- `Q-03` narrows. The band it governs is now slivers rather than a mix of
  slivers and genuine partial coverage.
- `pipeline.md` — `scripts/` and `data/` exist and hold the rebuilt table.

## Next

Export `center_pivot_irrigation_trusses`. The legacy backstop in
`merge_training_set.js` cannot run locally without it, so the negative set is
not yet comparable to `training_fields_md_2022`.

Then the 87 skipped positive points, which `A-04` and `Q-05` both point at.
