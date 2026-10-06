# D-03 — The CDL field is the labeling unit

## Status

accepted

## Context

A second labeling round is unavoidable. Three findings require it: positives are
easier than the population by an unmeasured amount (`A-04`, refuted), 1-3% of
negatives carry an undetected truss (`data.md`), and `A-03` has never been
tested because no field was labeled twice. All three are answered by people
looking at fields again.

What those people should be asked to do is the open question, and round 1
answered it two different ways.

The positive pass asked for a drawn polygon around the field a pivot sits on. A
drawn polygon is not a field, so a script had to decide which CDL fields each
one meant. That step is promotion, and everything `D-02` exists to patch is
downstream of it: two thresholds, neither derived from first principles, one of
which acted as a shape filter on the largest irrigated fields, plus the
pixel-area error in `2026-10-05-promotion-overlap-measure`.

The negative pass asked a question about a CDL field directly. It needed no
promotion, produced no excluded band, and its defects — a rejection path that
discarded data, and one bucket covering both "no truss" and "could not tell" —
are implementation faults rather than consequences of the design.

## Options considered

**Draw again, with promotion corrected.** Keeps the round-1 positive workflow and
relies on `D-02`. Rejected: the thresholds remain unjustified, the labels remain
inconsistent about whether they trace a pivot circle or a field outline, and the
band keeps regenerating. Correcting the arithmetic does not remove the need to
guess which field a drawing meant.

**Relabel all 693 round-1 drawings to a single protocol.** Removes the
inconsistency at source. Rejected for the reason `D-02` already gives: the
labelers' judgement that a truss is present is not in question, only the polygon
they drew, and discarding that judgement to redraw it is disproportionate.

**Label CDL fields directly, as the negative pass did.** Chosen.

## Decision

A labeling task presents one CDL field and collects one answer about it. No
geometry is drawn. The field's `field_id` (`D-01`) is the identifier, so an
answer is a row and nothing converts it.

Four answers, replacing round 1's two-plus-skip:

| answer | records |
|---|---|
| yes | class 1 |
| no | class 0 |
| unsure | no class |
| not a field | no class, counts toward `A-05` |

Separating "no" from "unsure" is the point of having four. Round 1 collapsed
them, and the collapse is what hid an 11-fold spread in skip rate behind a
single bucket.

A written note is required for *unsure* and *not a field*, optional for *yes*
and *no*. This is round 1's skip rule, retained because the free-text reasons
are what both round-1 log entries were built from.

**Every answer writes a label row.** Round 1's reject path wrote a progress
marker and no label, which is how the 19 truss-bearing fields in
`2026-09-17-negative-pass-rejections` left the dataset.

**Two queues, two interfaces.** Positive re-check presents every CDL field a
round-1 hand-drawn label touched, plus the 103 fields underlying the 87 skipped
pivots, and overlays the legacy pivot outline, because the question is which
field a known pivot sits on. Negative re-check presents fields from the
negative pass with no overlay, because the question is whether a truss is there
at all. The overlay reveals which queue a field belongs to, so one mixed
interface would blind nobody and is not worth the complexity.

**Each queue carries its own shared subset**, assigned to every labeler but the
field's own round-1 one, and indistinguishable from the rest of their queue.
The queues ask different questions, so the subsets measure different things:
Queue A's carries trusses at a high rate and yields agreement on truss
judgement, while Queue B's, at the contamination rate in `data.md`, expects one
or two truss-bearing fields and yields agreement on empty-field judgement
instead. The contamination rate itself comes from the full Queue B pass, not
from its subset. Announcing either would measure best effort rather than
ordinary effort.

**No labeler receives a field they judged in round 1.** The round-1 exports
carry `labeler` on every row, so this is enforced when queues are built.

Assignment is an **even** per-person split under a fixed seed, one shuffled
queue each, and a committed assignment table. Round 1 split the negative pass by
workload, 40 fields to 201, and that spread is what left its truss-detection
test unusable (`2026-10-05-negative-queue-allocation`). This round exists to
measure labeler behaviour, so comparable n per person is the point rather than a
nicety.

**Fields the negative re-check finds a truss on are parked, not dropped and not
blended.** They are tagged by provenance and kept distinguishable, as the 13 in
`data.md` already are, because statewide-sampled positives are the project's
only probe for the Eastern Shore bias.

## Consequences

**Promotion stops applying to new labels.** `D-02` is not superseded — it
records how today's positives were derived — but once the round lands it governs
no field's class. The queue covers every field a round-1 label touched, the 407
both measures agreed on included. Two measures agreeing establishes which field
a blob maps to and says nothing about whether a truss is there; that claim is
`A-19`, and it rests on one person looking once after being shown a legacy-map
pin asserting a pivot was present. Excluding the 407 would leave the largest
block of positives as the one group nobody re-checked. Sampling them was the
alternative and is worse: a rate does not fix labels, so any non-zero result
forces reviewing the rest anyway.

**`Q-03` and `Q-05` are resolved and come off the open list.** The band is
hand-relabeled, which was one of `Q-03`'s options; the shared subsets are the
round `Q-05` asked about, obtained as part of work already needed rather than as
new spend.

**Three assumptions become measurable.** `A-03` gets an agreement figure from
the shared subsets. `A-04`'s unquantified gap gets sized by the 87 skipped
points, which enter the positive queue. `A-19` is answered outright, since every
field promotion decided is put to a person.

**The ambiguity that caused the promotion bug ceases to exist.** Whether to
trace the field outline or the pivot circle is no longer a question anyone can
answer wrongly, because nobody draws.

**Cost is people-time.** 2,480 fields — 1,547 in the positive queue, 933 in the
negative one — and 3,080 judgements once the shared subsets are counted, which
is 435 to 448 per labeler. Round 1 was about 1,780 judgements, each requiring a
polygon to be drawn. Answering is much faster than drawing, but this is a second
round of volunteer labor and it is the critical path.

**A second round means a second set of labeler thresholds.** Four answers make
divergence visible rather than preventing it. The per-labeler rate checks that
produced both round-1 findings apply again, and should be run before the results
are used.

**Six band fields stay unresolved.** The band holds 6 fields originating in the
negative pass. They are out of the positive queue by provenance and out of the
negative queue by class, and are parked under the rule above rather than routed.

**Asset names cannot carry `field_id`.** The `D-01` format begins with a minus
sign and contains an underscore, which round 1's progress-folder name parsing
cannot read. Assets are named by queue position; `field_id` is a stored property.
