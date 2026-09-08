# Problem Statement

This repository builds a model that identifies which agricultural fields on the
Maryland Coastal Plain are irrigated, using publicly available remote sensing
data. It answers *where* irrigation occurs. It does not estimate *how much*
water is applied.

## Context

Team AGWA is investigating how saltwater intrusion salinizes Maryland cropland,
and what that costs. Groundwater pumped for irrigation is one of the mechanisms
that draws saltwater inland, so knowing where irrigation happens is a
prerequisite for modeling where salinization will spread. The AGWA research
proposal (Spring 2026) sets out three linked models — irrigation, soil
salinization, and economic impact. This repository is the first half of the
first one.

The proposal's opening research question is "where and how much are farmers
irrigating in Maryland?" This repository takes the *where*.

## Research questions

**RQ1.** Can irrigated cropland on the Maryland Coastal Plain be identified at
field scale from publicly available remote sensing data?

**RQ2.** Which data sources carry the signal — high-resolution single-date
imagery, multi-temporal vegetation indices, elevation, or some combination?

**RQ3.** How much irrigation does a detector trained on center-pivot systems
miss, and can that shortfall be quantified rather than merely acknowledged?

**RQ4.** Does the result improve on the irrigation maps already available for
Maryland?

## What we claim to detect

The goal is irrigated cropland. What the current system detects is a subset of
it — fields carrying a visible center-pivot truss — because that is what the
training labels encode (`data.md`). These are not the same thing; see the
callout in `glossary.md`.

We state the ambition rather than retreating to the narrower claim.
Center-pivot-only mapping has been done for this region before and criticized
precisely for missing other systems, so repeating it is not worthwhile. And the
gap is measurable: RQ3 makes quantifying it part of the work rather than a
limitation noted in passing. The assumptions this rests on are recorded in
`assumptions.md`.

## Scope

**Geographic.** The Maryland Coastal Plain. Models are trained on and reported
for this region. Labeled data exists statewide (`data.md`) and is retained as an
auxiliary set rather than discarded. The operational definition of the boundary
is not yet settled; see `open-questions.md`.

**Temporal.** A single epoch, anchored on 2022. The model describes irrigation
status for that period rather than a time series. Extending to multiple years is
future work, deliberately deferred.

**Task boundary.** Detection only.

## Out of scope

Explicitly not in this repository:

- **Water balance.** Estimating irrigation volume from crop type, planting date,
  and rainfall is the second half of the irrigation model. It is a different
  kind of problem — a physical accounting calculation rather than a learned
  classifier — and lives in a separate repository.
- **The soil salinization model** and **the economic impact model.** Downstream
  stages of AGWA, separate work.
- **Farmer survey design and administration.** Survey results may validate this
  model's output, and RQ3 depends on them, but the instrument and its IRB
  approval are handled elsewhere.
- **The public-facing tool.** Delivering results to stakeholders is a later
  phase of the project.

## What success looks like

Numeric thresholds live in `evaluation.md`. This section states the kind of
claim we want to be able to make.

**The scientific bar.** The model should outperform the irrigation maps already
available for Maryland, measured on validated Maryland data, at a resolution
useful for fields of the size that actually exist here. If it does not beat what
already exists, it does not justify publication.

**The downstream bar.** The salinization model consumes irrigation as an input.
Success means irrigation error is small enough that it does not dominate that
model's error budget. This bar is the one that matters for the project even
though it is harder to measure, and it can be met or missed independently of the
scientific bar.

**Honesty about coverage.** A quantified answer to RQ3 is part of success. A
model that performs well on center-pivot fields while silently missing
linear-move and drip irrigation, with no estimate of how much that is, has not
met the bar regardless of its scores.

## Downstream use

The salinization model needs irrigation as a spatial input: which areas draw
groundwater, and with what confidence. Our output is finer-grained than that
model requires, so aggregation is expected downstream rather than here.
