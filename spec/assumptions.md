# Assumptions

What this project is proceeding as if true, without having established it.

`data.md` says what is true about the dataset. This file says what we are
betting is nonetheless acceptable. An entry earns a place here only if it is
**load-bearing** — if it turns out to be false, something we claim or build has
to change.

Three things get confused with each other, so file them correctly:

- **Assumption** — a truth claim we act on but have not tested. Belongs here.
- **Open question** — a choice we have not made. Not a truth claim. Belongs in
  `open-questions.md`.
- **Limitation** — a constraint known to be true and not fixable. Stated
  wherever it bites.

Status values are `untested`, `supported`, `refuted`, `retired`. Where an
assumption has been tested, the entry cites the research-log entry that tested
it.

## Label validity

### A-01 — A visible truss means the field is irrigated

**Status:** untested
**We assume:** a field carrying a visible center-pivot truss was actually
irrigated during the period the imagery covers.
**Why:** this is the premise of the whole labeling effort. A pivot is capital
equipment and is not usually left standing in a field it does not serve.
**If wrong:** every positive label is suspect, and the model predicts
infrastructure presence rather than irrigation. RQ1 becomes unanswerable as
posed.
**How we would find out:** the farmer surveys. The team already identifies this
as the specific thing the survey is meant to confirm.

### A-02 — Imagery interpretation is accurate enough to be ground truth

**Status:** untested
**We assume:** what a labeler believed they saw in NAIP corresponds to what is
physically present on the ground.
**Why:** no field verification was available at labeling scale.
**If wrong:** label error propagates into every reported metric, and measured
performance describes agreement with labelers rather than agreement with
reality.
**How we would find out:** farmer surveys on a sample; comparison against the
legacy truss map where the two overlap.

### A-03 — One labeler per field is sufficient

**Status:** untested
**We assume:** labelers agree with each other closely enough that single
labeling introduces negligible noise.
**Why:** labeling capacity was limited, and duplicating fields would have cut
coverage proportionally.
**If wrong:** an unknown share of labels are wrong in an unknown direction, with
no way to correct after the fact.
**How we would find out:** a small overlap round, where several labelers relabel
the same sample, yields an inter-rater agreement figure. This can be done now —
the labeling interface still works.
**Circumstantial evidence against:** labelers diverge sharply on both adjacent
judgments, skip rate and truss detection (`A-04`, `data.md`). Status stays
`untested`: no field was labeled twice, so there is no agreement to measure and
none of this substitutes for the round in `Q-05`.

### A-04 — Skips were not driven by difficulty

**Status:** refuted by `2026-09-15-labeler-skip-rate-heterogeneity`
**We assume:** points skipped during positive labeling were skipped for reasons
uncorrelated with how hard the field is to classify.
**Why:** skipping was intended for unusable points — bad imagery, a point not on
a field — rather than for hard calls.
**If wrong:** the surviving positives are systematically the easy ones, and
every metric is optimistic relative to production.
**How we would find out:** skip reasons were required free text and are stored
with the progress assets. Read them.
**What we found:** the reasons pass and the rates do not. Notes describe the
scene, as assumed, but skip rate varies elevenfold across labelers on randomly
dealt queues (`data.md`), so the decision turns on where each set their
threshold. The **If wrong** consequence holds, by a mechanism the stated test
could not detect.

## Field geometry

### A-05 — CDL polygons approximate real fields well enough

**Status:** refuted by `2026-09-17-negative-pass-rejections`
**We assume:** a CDL-derived polygon corresponds closely enough to a real
agricultural field to serve as the unit of prediction.
**Why:** CDL is the only statewide field-boundary source available without cost
or manual delineation.
**If wrong:** the unit of prediction is not a field but an arbitrary raster
clump, and both labels and predictions describe something other than what we
claim. Downstream aggregation inherits the error.
**How we would find out:** the overlap-ratio distribution between hand-drawn
labels and CDL fields already measures this, and is currently used only to set a
threshold. How tight the upper cluster is constitutes the evidence.
**What we found:** 34 of 1001 randomly drawn CDL polygons are not agricultural
land at all — 3.4%, a lower bound since rejection was discretionary, and it
applies to the whole inference population. The overlap-ratio test named above is
still unrun and measures a different failure: how well boundaries match fields
that are genuinely fields.

### A-06 — The 1-hectare floor does not exclude a meaningful share of irrigated fields

**Status:** untested
**We assume:** fields smaller than 1 hectare are rare enough among irrigated
Maryland fields to disregard.
**Why:** below roughly twelve CDL pixels, a vectorized clump is mostly boundary
artifact.
**If wrong:** we reproduce the exact failure the research proposal criticizes in
prior national irrigation mapping — a resolution too coarse for the field sizes
that actually exist in Maryland.
**How we would find out:** compare the size distribution of fields in the legacy
truss map against the floor.

### A-07 — The three-year crop consensus does not systematically exclude irrigated land

**Status:** untested
**We assume:** requiring a pixel to be cropland in 2021, 2022 and 2023 drops
fields at a rate uncorrelated with whether they are irrigated.
**Why:** the consensus requirement was intended to exclude land moving in and
out of production.
**If wrong:** irrigated fields in rotation are absent from both training and
inference, and any statewide extent estimate is biased low.
**How we would find out:** compare single-year CDL crop masks against the
consensus mask within areas known to be irrigated.

## Sampling and distribution

### A-08 — Restricting to the Coastal Plain removes the region/class confound

**Status:** untested
**We assume:** once western Maryland is excluded, positives and negatives are
drawn from populations similar enough that the model must learn what a truss
looks like rather than what the Eastern Shore looks like.
**Why:** the confound exists because the legacy truss map covers only the
Mid-Atlantic (`data.md`).
**If wrong:** the confound persists within the Coastal Plain — negatives still
cluster away from irrigated areas — and scores stay inflated for the same reason
as before, just less visibly.
**How we would find out:** train on Coastal Plain only and on statewide data,
evaluate both against Coastal Plain test data, and compare. An early experiment.

### A-09 — Fields with no truss overlap are genuinely not irrigated

**Status:** untested
**We assume:** a field a labeler confirmed as truss-free is not irrigated by
some other means.
**Why:** no data source available during labeling identifies linear-move or drip
systems.
**If wrong:** an unknown fraction of class 0 is actually irrigated, which caps
achievable recall and makes measured precision misleading in a direction we
cannot correct for.
**How we would find out:** farmer surveys. RQ3 depends on this. A time-series
detector, if one is built, offers a second and cheaper route: fields it flags as
behaving irrigated while carrying no truss are candidates for precisely the
systems this assumption overlooks (`Q-08`).

### A-10 — The excluded band is small enough to leave undefined

**Status:** refuted by `2026-10-05-promotion-overlap-measure`
**We assume:** fields overlapping a hand-drawn label by more than zero but less
than the promotion threshold are few enough that having no training examples and
no agreed label for them does not materially affect production accuracy.
**Why:** the band was excluded to keep the negative set clean, not because
anyone measured how large it is.
**If wrong:** a meaningful share of the fields we score in production fall in a
region where model behaviour is undefined and unvalidated.
**How we would find out:** count them. One query.
**What we found:** the band is comparable in size to the positive set
(`data.md`). Not few enough, and every one of those fields is scored at
inference. `Q-03` has to decide what happens to them.

## Detectability

### A-11 — A truss is resolvable in NAIP

**Status:** supported
**We assume:** center-pivot trusses are visible at NAIP resolution (`data.md`)
at the scale a model will see.
**Why:** labelers located trusses in NAIP throughout the labeling effort, and
the team has worked examples.
**If wrong:** no amount of modeling recovers the signal, and the approach fails
at its foundation.
**How we would find out:** the evidence so far is indirect — humans succeeding
at the task does not establish that a model can. A simple baseline separating
the classes at all would strengthen this considerably.

## Downstream

### A-12 — Field-level presence is what the salinization model needs

**Status:** untested
**We assume:** a binary per-field classification, aggregated, is a usable input
to the salinization model.
**Why:** the research proposal treats irrigation as one input among many, at
coarser resolution than field scale.
**If wrong:** we deliver something the next stage cannot consume, and the
downstream bar in `problem-statement.md` is missed regardless of how accurate
the model is.
**How we would find out:** ask. The salinization work is being specified in
parallel, and its input requirements can be checked now rather than discovered
at integration.

### A-13 — A 2022 snapshot is representative

**Status:** untested
**We assume:** irrigation extent changes slowly enough that a single-epoch map
stays useful to a salinization model reasoning over longer periods.
**Why:** irrigation infrastructure is capital equipment and is not installed or
removed frequently.
**If wrong:** the map ages faster than downstream use requires, and the
single-epoch decision has to be revisited.
**How we would find out:** the legacy truss map predates our labels. Comparing
the two gives a direct estimate of how much changed over that interval.

## Modeling

These follow from the approach described in `model.md`. Because that approach is
itself a leading candidate rather than a settled choice (`Q-06`), some of these
are retired rather than refuted if the framing changes.

### A-14 — Pretrained features transfer across the gap to our imagery

**Status:** untested
**We assume:** a backbone pretrained on some other imagery produces features
useful for finding trusses in sub-metre aerial imagery.
**Why:** training from scratch on a dataset this size is not viable, so transfer
is what makes a dataset this size workable at all. But neither candidate family
(`Q-07`) matches our data cleanly. Geospatial foundation models are pretrained
on Earth observation imagery, largely at 10–30 m, where a truss is not
resolvable at all — their features describe spectral and landscape-scale pattern
rather than the fine structure this task depends on. General image backbones
preserve fine spatial detail but are pretrained on ordinary photographs,
matching neither our domain nor our bands. Each breaks the match somewhere
different.
**If wrong:** the backbone contributes little and the effective model is
whatever a small trainable head can learn from a small dataset. The performance
ceiling drops sharply and dataset size becomes binding.
**How we would find out:** compare each candidate against a randomly initialised
backbone of the same architecture. A small gap means transfer is not doing the
work we are relying on.

### A-15 — Truss evidence is concentrated in a few tiles

**Status:** untested
**We assume:** within a positive field, the signal sits in a small number of
tiles rather than spread thinly across many.
**Why:** this is the premise of Top-K aggregation. If evidence were diffuse,
selecting only the highest-scoring tiles would discard most of it.
**If wrong:** Top-K is the wrong aggregation, and mean pooling or attention over
all tiles would perform better.
**How we would find out:** inspect the distribution of tile probabilities within
predicted-positive fields once a model exists. A sharp spike over a few tiles
supports it; a long flat distribution refutes it.

### A-16 — Field-level supervision is sufficient at this dataset size

**Status:** untested
**We assume:** the field-level labels in `data.md` are enough to train tile-level
discrimination through aggregation.
**Why:** no tile-level labels exist, and producing them would mean relabeling at
far finer granularity than the effort already spent.
**If wrong:** the model fails to localise and instead learns field-level
shortcuts — shape, crop class, colour — which reproduces the confound problem of
`A-08` one level down, where it is harder to see.
**How we would find out:** check whether the highest-scoring tiles actually
contain trusses. If they do not, the model is right for the wrong reason.

### A-17 — A tile is identifiable in isolation

**Status:** untested
**We assume:** a truss segment can be recognised in a single tile without seeing
the rest of the field.
**Why:** tiles are classified independently, so context beyond the tile boundary
is unavailable by construction.
**If wrong:** tile size has to grow until enough context is included, which
pushes the design toward whole-field classification and undercuts the MIL
framing (`Q-06`).
**How we would find out:** have a person try to classify sampled tiles shown in
isolation. If a human cannot do it, a model is unlikely to.

### A-18 — Rotation augmentation does not destroy signal

**Status:** untested
**We assume:** randomly rotating field imagery removes an orientation bias
without removing usable information.
**Why:** a center pivot is radially symmetric, so field orientation appears
uninformative about the label.
**If wrong:** shadow direction is a real cue, and random rotation produces
configurations that cannot physically occur — degrading the input rather than
regularising it. Reasoning in `model.md`.
**How we would find out:** ablate. Train with and without rotation and compare.
