# Open Questions

Choices this project has not made yet. Each has live options, and picking one
commits us to something.

The distinction between an assumption, an open question, and a limitation is set
out in `assumptions.md`. The line this file has to hold separately is the one
against tasks: a question is *what to do*, a task is *doing it*. Work items go
in issues, not here.

**When a question is resolved it comes off this list**, and an ADR in
`spec/decisions/` takes its place. This file describes what is currently open,
so a resolved question does not belong in it — the decision record carries the
history. Status is therefore only ever `open` or `parked`.

## Q-01 — How is the Coastal Plain boundary defined?

**Status:** open
**The question:** which specific dataset or rule delimits the Coastal Plain for
training, evaluation, and reporting?
**Why it matters:** it defines the population the model is trained on and
reported for (`problem-statement.md`). Almost nothing can be finalised without
it.
**Options:** a published physiographic province boundary; an explicit list of
counties; the fall line as a proxy; a soil-survey-derived boundary.
**What would settle it:** the salinization model defines a study area too, and
the two should not disagree. Coordinating on one shared boundary matters more
than which candidate is chosen.

## Q-02 — Does LiDAR re-enter the approach?

**Status:** parked
**The question:** should DSM or point-cloud data be used alongside or instead of
NAIP imagery?
**Why it matters:** the research proposal originally made this the primary
method, and it is currently the most plausible route to RQ3. Linear-move systems
produce no circular signature, which is why they are near-invisible to a
pattern-based approach on aerial imagery — but a linear-move truss is still a
physical structure, and structures appear in a surface model. LiDAR is therefore
not a redundant second path to center-pivot detection; it is a possible path to
the systems we currently miss entirely.
**Options:** leave parked; run a pilot on a county where LiDAR coverage and
known linear-move systems overlap; revive as a primary input.
**What would settle it:** whether NAIP-only detection clears the bar, and
whether any labeled linear-move examples exist to test against. Note that none
currently do, so a pilot needs labels created first. USGS iMaps 2020 and 2023
are available by county.

## Q-03 — How should the excluded overlap band be labeled?

**Status:** open
**The question:** what happens to fields a hand-drawn label touches without
satisfying either promotion condition in `D-02`?
**Why it matters:** these fields are currently in neither class and absent from
training, yet they are scored at inference (`data.md`). The answer determines
whether the dataset has to be regenerated, which is far cheaper to establish
before training than after.
**Options:** leave them excluded; lower one of the `D-02` thresholds; treat the
band as an explicit ignore class, excluded from training but reported separately
at inference; hand-relabel the band.
**What would settle it:** counting it refuted `A-10` — the band is comparable
in size to the positive set (`data.md`). A field enters it only by failing both
`D-02` measures, so what remains should be mostly label slivers rather than
genuine partial coverage. Confirming that on a sample is what is left.

## Q-04 — Three channels or four?

**Status:** open
**The question:** does the model consume RGB only, or RGB plus near-infrared?
**Why it matters:** NIR is where vegetation signal is strongest and is plausibly
informative about irrigation, but pretrained backbones expect three channels, so
using it means modifying the first convolutional layer rather than loading
weights unchanged. The team's planning material currently says both.
**Options:** RGB with an unmodified pretrained backbone; four channels with a
modified first layer, initialising the new channel from the pretrained weights;
RGB plus an NIR-derived index supplied separately.
**What would settle it:** an ablation once any baseline exists. Both are cheap
to run and the answer is empirical.

## Q-05 — Should an inter-rater agreement round be run?

**Status:** open
**The question:** should labeling capacity be spent having several labelers
relabel the same sample of fields, to measure how much they agree?
**Why it matters:** A-03 is untested, and without a round there is no number for
label noise — a gap a reviewer will ask about. The cost is real: the labeling
effort is otherwise complete, so this is new work rather than a reallocation.
Two entries have since shown labelers diverging sharply on adjacent judgments,
so the expected disagreement is no longer hypothetical; see the evidence listed
under `A-03`.
**Options:** no round; a small round on a sample, all labelers; a round on
positives only, where errors are most consequential; or a targeted round that
doubles as a measurement — re-review a sample of one labeler's confirmed
negatives using a labeler with a high truss-detection rate, and re-label the
skipped positive points (`data.md`).
**What would settle it:** whether the resulting number would change anything.
That test now has answers it did not have before. A round would size two
quantities the project already needs and cannot otherwise obtain: how many
positives were lost to skip-threshold variation (`A-04`, refuted) and how many
trusses sit undetected in the negative set (`data.md`). Both feed directly into
reported precision and recall, so the number would be acted on rather than only
reported. The last option is the cheapest route to both and to an agreement
figure at the same time.

## Q-06 — Multiple Instance Learning, or a whole-field classifier?

**Status:** open
**The question:** does the model classify a field by cutting it into tiles and
aggregating tile predictions, or by resizing the whole field and classifying it
directly?
**Why it matters:** it determines the architecture, the input pipeline, and how
much data the approach needs to work. It is also far cheaper to settle before
building around one of the answers than after.
**Options:** MIL with tile selection and aggregation, as described in
`model.md`; whole-field classification at a fixed input resolution; or a
sequenced version where the whole-field model is built first and MIL has to beat
it to justify its complexity.
**What would settle it:** running both. The whole-field model is much cheaper to
build and already earns its place as a baseline in `evaluation.md`, so building
it first costs almost nothing and produces a usable number either way. That
makes the sequenced option attractive on practical grounds regardless of which
approach eventually wins.

## Q-07 — Which pretrained backbone family?

**Status:** open
**The question:** should the tile encoder start from a geospatial foundation
model, or from a general image backbone pretrained on photographs?
**Why it matters:** it determines the input format, the band configuration, the
fine-tuning strategy, and how much of the model can be frozen. It also
interacts with `Q-04`, since the families expect different band counts.
**Options:** a geospatial foundation model — Prithvi, Galileo, Presto and
similar; a general image backbone such as ResNet or EfficientNet; or both, one
serving as the comparator for the other.
**What would settle it:** an empirical comparison, with a randomly initialised
backbone included so the size of the transfer benefit is visible rather than
assumed (`A-14`). The question is not which family is better in general, but
which transfers across the scale gap to sub-metre aerial imagery — see the
reasoning in `model.md`.

## Q-08 — Detect irrigation from behaviour over time, not from infrastructure?

**Status:** open
**The question:** should a time-series approach — vegetation and moisture
response across a growing season, read against observed rainfall — be developed
alongside the imagery-based detector?
**Why it matters:** it is the only route to RQ3 identified so far. Imagery
detection finds equipment. A time-series model would find the act of irrigating,
which linear-move and drip systems share with center pivots even though they
leave nothing visible from above: during a dry stretch a rainfed field browns
while an irrigated one stays green, and rainfall is known independently. The
research proposal's literature review already points here — crop-health patterns
over time, and soil moisture deviating from what precipitation predicts — while
noting that vegetation indices alone overestimate irrigation unless paired with
radar.
**Options:** imagery only; time series only; or both, with the disagreement
between them used as the measurement rather than treated as a problem.
**What would settle it:** the third option has a property the others lack. Our
labels record truss presence, so a time-series model trained on them and applied
broadly will flag fields that behave irrigated without having a truss — exactly
the linear-move and drip candidates, and a sample of them can be checked against
the farmer surveys. That makes it a second and cheaper test of `A-09` than
surveys alone. The constraint is cost and data: it needs Sentinel-2 or similar
at 10 m on a regular revisit, cloud gaps and all, and at that resolution a
one-hectare field is only about ten pixels across. Note also that Presto, listed
as a backbone candidate in `Q-07`, is a pixel-timeseries model and sits more
naturally on this side of the question than on the imagery side.

## Q-09 — What spatial partitioning scheme splits the data?

**Status:** open
**The question:** what concrete scheme carves the study area into blocks for
training, validation, and test?
**Why it matters:** `evaluation.md` fixes the requirements a scheme must
satisfy — group by originating label, assign contiguous blocks whole, keep both
classes present in every fold — but not the scheme itself. Everything reported
depends on it, and changing it after results exist is exactly the kind of
revision preregistration is meant to expose.
**Options:** counties; a regular grid with a chosen cell size; watershed or
soil-region boundaries; contiguous clusters grown to balance class counts.
**What would settle it:** the binding constraint is that positives are confined
to the Eastern Shore (`data.md`), so blocks must be small enough that several
folds each contain positives, yet large enough that neighbouring fields do not
straddle a boundary. Counting how positives distribute under each candidate
scheme answers it directly. This also interacts with `Q-01`, since the study
area boundary determines what there is to partition.
