# Model

How a field becomes a prediction: the task formulation, the input
representation, the architecture, and the training procedure.

Metrics, data splits, and baselines are in `evaluation.md`. Where training runs
and how data gets there is in `pipeline.md`. What the model is *for* is in
`problem-statement.md`.

## Task formulation

Binary classification of a field as irrigated or not.

The label structure makes this weakly supervised. Labels exist at the level of a
whole field, but the evidence — a truss — occupies a small fraction of it. A
model given the entire field at once must find a thin structure inside a large
mostly-uniform image, and most of what it sees is irrelevant to the label.

The framing that follows from this is Multiple Instance Learning. Each field is
a bag; the tiles it is cut into are instances. The field is positive if any tile
contains a truss, and the field label supervises the bag rather than the
instances. No tile-level labels exist and none are needed.

### This framing is not settled

MIL is the leading candidate, not a decision. The alternative is a whole-field
classifier — resize the field to a fixed input size and classify it directly.
That is substantially simpler, has fewer moving parts, and on a dataset of this
size simplicity carries real weight.

The argument for MIL is that downsizing a whole field to a standard input
resolution destroys exactly the thin high-frequency structure the task depends
on. The argument against is that MIL adds tile selection, aggregation, and a
selection-dependent gradient path, all of which need enough data to be learned
reliably. Both arguments are empirical and neither has been tested here. The
choice is recorded as `Q-06` in `open-questions.md`.

## Unit and output

**Unit.** One CDL field, as defined in `data.md`. The model does not see
neighbouring fields, and each field is presented cropped to its own boundary.

**Output.** A probability that the field is irrigated. The probability is
retained rather than collapsed to a class at the point of prediction, because
downstream use aggregates over areas and needs the underlying values
(`problem-statement.md`).

A class can be obtained by thresholding, but the threshold is not 0.5 and is not
a modeling decision — see Prior shift below, and `evaluation.md` for how it is
chosen.

## Input representation

### Tiling

Each field is cut into overlapping tiles, and each tile is classified
independently.

Tiles overlap so that a truss crossing a tile boundary is not split into two
fragments too small to recognise in either. The overlap fraction has to be large
enough that any truss segment appears whole in at least one tile.

Tile size is bounded from both directions: large enough to contain a
recognisable length of truss along with enough context to distinguish it from
other linear features, and small enough that a positive tile is not dominated by
background. Both tile size and overlap are empirical and are set by experiment,
not asserted here.

Fields vary widely in area, so a fixed tile size means the number of tiles per
field varies widely too. This interacts with aggregation and is discussed there.

**Where tiling happens is an open fork.** Tiles can be cut server-side in Earth
Engine and exported as many small chips, or whole-field chips can be exported
and cut locally. These are different pipelines with different storage
footprints, different iteration speeds, and different failure modes. The choice
belongs with the export path and is not yet made.

### Channels

NAIP provides four bands. Whether the model consumes three or four is open, and
the tension is that pretrained backbones expect three. See `Q-04` in
`open-questions.md`.

### Normalization

Per-channel mean and standard deviation scaling.

The statistics must be computed over the training split alone, never over the
full dataset. Computing them across all data leaks information from the
evaluation set into training, in a way that is easy to do accidentally and
invisible once done.

### Augmentation

An augmentation asserts that some transformation leaves the label unchanged. The
specific transforms and their parameters are tuning decisions, recorded in the
research log alongside the runs that set them rather than fixed here.

One proposed invariance is worth stating, because it is a physical claim rather
than a tuning knob. Random rotation is motivated by the fact that a center pivot
is radially symmetric, so field orientation should carry no information about
the label. **This may not hold.** A truss is a thin raised structure, and its
shadow is often more visible than the structure itself. Shadow direction is set
by sun angle and acquisition time, and is consistent across imagery collected
under similar conditions. Random rotation produces shadow directions that cannot
physically occur, which may destroy a usable cue rather than remove a spurious
one (`A-18`).

## Architecture

Each tile passes through a pretrained network that outputs a probability that
the tile contains a truss.

Which pretrained family to start from is open (`Q-07`), and the two candidates
break the match with our data in different places.

**Geospatial foundation models** — Prithvi, Galileo, Presto and similar — are
pretrained on Earth observation data and are the natural fit by domain. The
complication is scale. They are pretrained largely on 10–30 m satellite imagery,
and a truss is not resolvable at all at that resolution. Their features describe
spectral and landscape-scale pattern rather than fine spatial structure, so
transfer here is a bet about scale rather than about content.

**General image backbones** — the ResNet and EfficientNet families — are
pretrained on ordinary photographs, matching neither our domain nor our bands.
But they do match the property this task depends on most: fine spatial detail.
They are also cheaper to try, and serve as a comparator whichever family wins.

Selection criteria either way: pretrained weights readily available, band
configuration compatible or adaptable (`Q-04`), and capacity suited to the
amount of data available rather than to large-benchmark performance.

Given the dataset size, most of the backbone is expected to stay frozen, with
only later layers and the classification head trained. How much to unfreeze is a
tuning decision constrained by overfitting rather than by compute.

## Aggregation

Tile probabilities are combined into one field probability by taking the highest
scoring tiles and pooling them.

The reason for selecting rather than averaging over everything: a truss occupies
a small part of a field, so most tiles in a positive field are negative. Mean
pooling over all tiles would dilute the signal until it is indistinguishable
from a negative field, and the dilution would be worse for larger fields.

Two things are unresolved:

**How many tiles to select.** A fixed count treats a small field and a large one
identically even though they contain very different numbers of tiles, so the
same K covers a large fraction of one field and a small fraction of another.
Selecting a proportion instead makes coverage consistent but the count varies,
which complicates batching. Neither is obviously right.

**How to pool the selected tiles.** A plain mean and a probability-weighted mean
are both reasonable, and attention-based pooling is a further option that learns
the weighting at the cost of more parameters to fit.

## Training procedure

The loss is binary cross entropy between the aggregated field probability and
the field label.

Training is end to end: gradients flow back through the aggregation into the
tiles that were selected. Tiles not selected receive no gradient on that step.
Because one network is applied to every tile rather than one network per tile,
an update driven by the selected tiles still changes how all tiles are scored,
so the selection shifts from step to step.

Selecting the highest-scoring tiles is a sorting operation and is not
differentiable. The standard treatment is to hold the selection fixed within a
step and differentiate through the values of the selected tiles rather than
through the act of selecting them.

This has a practical consequence at the start of training. Before the network
has learned anything, tile scores are near-random, so the selected tiles are
near-random and the first updates come from noise. The model has to bootstrap
out of that and does not always succeed. Two standard mitigations: begin with a
large K — which approaches mean pooling, where every tile contributes — and
reduce it as training progresses; or replace hard selection with soft attention
weights, which stays differentiable throughout at the cost of letting background
tiles contribute.

Optimizer, learning rate, and schedule are not specified here. They are tuning
decisions and belong in the research log alongside the runs that set them.

## Constraints shaping these choices

**Dataset size.** Roughly 1500 labeled fields (`data.md`, pending exact counts).
Tiling multiplies the number of images but not the number of independent labels
— that is inherent to weak supervision, not a shortcoming of it. Effective
sample size is the field count, and every choice above is made under that
constraint: freezing most of the backbone, leaning on augmentation, preferring
fewer trainable parameters.

**Prior shift.** The training set is close to balanced between classes. The
population the model is applied to is not: irrigated fields are a minority of
all CDL fields in Maryland. A model fit on balanced data and applied to an
imbalanced population is systematically overconfident, and the correction is
calibration and threshold selection against the production prior, not
rebalancing during training. Rebalancing the loss or resampling to correct an
imbalance that does not exist in the training data would push the model further
in the wrong direction.

**Compute.** Training targets the UMD Zartan or Nexus clusters. Environment and
data staging details belong in `pipeline.md`.
