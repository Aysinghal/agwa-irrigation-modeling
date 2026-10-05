# D-02 — A field is promoted on either overlap measure

## Status

accepted

## Context

Promotion converts a hand-drawn label into labels on CDL fields. The rule was
a single threshold: promote a field when the label covers at least 0.65 of it.

That measure depends on the shape of both polygons, and the labelers did not
draw the same thing as each other. `2026-10-05-promotion-overlap-measure`
records the evidence and the arithmetic error found alongside it.

The question is what to threshold on, given labels that are inconsistent about
whether they trace a pivot circle or a field outline.

## Options considered

**Keep field coverage, corrected.** Minimal change. Rejected: it drops 174
fields with a median area of 69.8 ha carrying 94% of a label, because a circle
cannot cover most of an elongated rectangle. Those are irrigated, and they are
the largest fields in the dataset — the ones that matter most to the
area-weighted metrics in `evaluation.md` and to the downstream bar in
`problem-statement.md`.

**Switch to blob share.** Shape-independent, and it has a real valley to put a
threshold in. Rejected alone: it drops 235 fields with a median area of 2.0 ha
that are 97% covered, because a small field is a negligible share of a large
label. Also irrigated.

**Require both.** Rejected: it keeps only the intersection of two rules that
each discard a legitimate group, so it discards both groups.

**Re-label all 693 positives to a consistent protocol.** Would remove the
inconsistency at source. Rejected as disproportionate: the labelers' judgement
of whether a truss is present is not in question, only the polygon they drew
around it, and the information needed to assign that truss to a field is
already recoverable from the labels as drawn.

**Accept either measure.** Chosen.

## Decision

A field is promoted when either condition holds:

- at least **0.15** of the hand-drawn label falls inside the field, or
- at least **0.65** of the field lies under the hand-drawn label.

A field failing both is a sliver and enters the excluded band governed by
`Q-03`. Which condition fired is recorded per field as `promoted_by`.

Both measures use exact polygon intersection. The 0.15 sits past the spill
cluster in the blob-share distribution; the 0.65 is the figure the project
already used, retained because nothing argues for moving it.

The rationale for a disjunction rather than a single measure: either condition
alone establishes that the pivot and the field physically coincide. One
describes a field the pivot sits on, the other a field that sits under the
pivot. Only a field satisfying neither is a label edge clipping a neighbour.

## Consequences

**The positive set grows and rebalances.** 868 fields from the legacy seed
against 714 before, plus the 13 recovered in
`2026-09-17-negative-pass-rejections`. Of the previous 714, 694 are reproduced;
the other 20 cleared the old threshold only because of the area inflation.
Class balance becomes 1 : 1.07.

**Positives are no longer filtered by field shape.** This removes a bias that
ran opposite to the project's purpose, since the discarded fields were the
largest.

**Two thresholds now need justifying instead of one.** Neither is derived from
first principles. The 0.15 has a visible distributional break behind it; the
0.65 has only precedent. Both are parameters a reader may reasonably question.

**The band is smaller and cleaner.** 576 fields, down from 730, and membership
no longer depends on field proportions. `Q-03` still has to decide what happens
to them, but it is deciding about slivers rather than about a mixture.

**Earlier results are not comparable.** Anything computed against
`training_fields_md_2022` or `cdl_fields_positive_md_2022` predates this and
used both the old rule and the inflated ratios.

**Promotion now lives in this repository rather than in Earth Engine.**
`scripts/build_label_table.py` is the implementation; `promote_positives.js`
stays as the record of how the dataset was originally made and is not rerun.
