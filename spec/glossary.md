# Glossary

Shared vocabulary for this project. Terms are grouped by theme rather than
alphabetized, because the groups build on each other.

Definitions only — no values. What "field coverage" *means* is here; the
threshold it is set to lives in `data.md`. Same for dataset specifications,
crop class ranges, and size floors.

## Study area and geography

**Coastal Plain** — The low-lying geological province east of the fall line,
covering Maryland's Eastern Shore and Southern Maryland. Nearly all irrigation
in the state occurs here.

**Fall line** — The boundary between the Piedmont and the Coastal Plain, running
roughly along I-95 in Maryland. Farms west of it are predominantly rainfed.

**Eastern Shore** — The portion of Maryland east of the Chesapeake Bay.

**Delmarva Peninsula** — The peninsula shared by Delaware, Maryland, and
Virginia, between the Chesapeake Bay and the Atlantic.

## Irrigation

**Irrigation** — The deliberate application of water to cropland, as distinct
from rainfall.

**Center-pivot irrigation system** — A rotating span of pipe anchored at a fixed
central point, sweeping a circle across the field as it turns. The dominant
irrigation type visible from above in Maryland.

**Truss** — The physical span of pipe and its supporting framework. This is the
structure visible in aerial imagery, and the thing labelers were asked to find.

**Pivot circle** — The circular crop pattern a center pivot leaves behind. Often
visible in imagery even when the truss itself is not.

**Linear-move irrigation** (also lateral-move) — A span that travels in a
straight line across a rectangular field instead of rotating. Leaves no circular
signature and is substantially harder to identify from imagery.

**Drip irrigation** — Water delivered at or below the soil surface through
tubing. Effectively invisible in aerial imagery.

> **A visible truss is not the same as irrigation.**
>
> Every positive example in our training set is a field with a *visible
> center-pivot truss*. The quantity we actually care about is whether a field is
> *irrigated*. These differ in both directions: linear-move and drip systems
> irrigate without producing the signature we detect, so an irrigated field can
> sit in our negative set; and a truss present in imagery is not proof it was
> operated in a given season.
>
> Keep the two ideas verbally distinct in everything written for this project.
> The gap between them bounds what the model can honestly claim.

## Remote sensing and data sources

**Raster** — Data stored as a grid of pixels, each holding a value. Imagery and
classifications are rasters.

**Vector** — Data stored as geometry — points, lines, polygons — with attached
attributes. Field boundaries and labels are vectors.

**Spatial resolution** — The ground area represented by one pixel. Finer
resolution means smaller pixels and more visible detail.

**Band** — One range of wavelengths recorded by a sensor, such as red or
near-infrared.

**Mosaic** — Many overlapping images merged into a single seamless image.

**NAIP** — National Agriculture Imagery Program. USDA aerial imagery of the
continental United States, flown during the growing season, with visible and
near-infrared bands. Fine enough to resolve individual irrigation trusses.

**CDL** — Cropland Data Layer. A USDA NASS raster published annually that
classifies each pixel by crop type. Much coarser than NAIP.

**NDVI** — Normalized Difference Vegetation Index, computed as (NIR − Red) /
(NIR + Red). A standard proxy for vegetation density and vigor.

**Sentinel-2 / Landsat** — Satellite programs providing multispectral imagery on
a regular revisit cycle. Coarser than NAIP but far more frequent, which is what
makes time-series analysis possible.

**LiDAR** — Laser ranging, typically airborne, producing precise
three-dimensional measurements of surface elevation.

**LPC** (LiDAR point cloud) — The raw three-dimensional points a LiDAR survey
returns, before any gridding.

**DSM** (digital surface model) — A raster of the elevation of the topmost
surface, including buildings, vegetation, and structures.

**DEM** (digital elevation model) — A raster of bare-earth elevation, with
structures and vegetation removed. A truss appears in a DSM but not in a DEM.

**Earth Engine** (GEE) — Google's cloud platform for geospatial analysis. Hosts
the public datasets above and stores this project's labeling assets.

**TIGER** — US Census Bureau boundary files; the source of our Maryland state
boundary.

## Project-specific terms

**Field** — Our unit of analysis: one CDL field polygon. Not a farm, not a
parcel, not a tax lot. When this document says "field," it means this.

**CDL field** — A polygon produced by vectorizing pixels the CDL classifies as
crop across several consecutive years, then discarding blobs below a minimum
size. Approximates a real agricultural field, imperfectly.

**Labeler** — A team member who reviews imagery and assigns labels.

**Assignment** — A point or field allocated to a specific labeler, with a
position in that labeler's queue.

**Hand-drawn label** — The polygon a labeler drew by hand around a field
containing a truss. Human-drawn geometry.

**Positive field** — A CDL field promoted to class 1 because its overlap with
hand-drawn labels met the threshold. CDL geometry, not human geometry. Distinct
from a hand-drawn label, and the two must not be used interchangeably.

**Negative field** — A CDL field a labeler confirmed contains no visible truss.
Class 0.

**Field coverage** — The fraction of a CDL field's area lying under hand-drawn
labels. One of the two measures promotion uses.

**Label share** — The fraction of a single hand-drawn label's area lying inside
a given CDL field. The other. Unlike field coverage it does not depend on the
field's shape, which is why both are needed; the rule combining them is `D-02`.

**Exclusion set** — Every CDL field that touches any hand-drawn label at all,
including touches too small to qualify as positive. Negatives are never sampled
from this set, because even a slight touch means a truss is nearby.

**Legacy truss dataset** — A pre-existing center-pivot inventory, used to seed
the labeling assignments and later as a backstop check against mislabeled
negatives. Predates our imagery.

**Training set** — Positive and negative fields merged into one labeled
collection. The pipeline's output and the model's input.

## Modeling

**Ground truth** — The label treated as correct when training and evaluating.
Ours is human interpretation of imagery, not field measurement.

**Classification** — Assigning each input to one of a fixed set of classes.
Ours is binary: truss present or absent.

**Feature** — A measured input variable the model uses to make its prediction.

**Train / validation / test split** — The three subsets used to fit the model,
tune it, and finally judge it. Test data is used once, at the end.

**Spatial autocorrelation** — The tendency of nearby locations to resemble each
other more than distant ones. Neighboring fields share weather, soil, imagery
date, and often the same farm operator.

**Leakage** — When information from evaluation data reaches training, inflating
scores. Spatial autocorrelation causes it directly: under a random split, a
field's near neighbor may land in training, making that field trivially easy at
test time.

**Class imbalance** — When one class is far rarer than the other. Our training
set is close to balanced; the real prevalence of irrigated fields across
Maryland is not.

**Precision** — Of the fields the model flagged, the fraction that really are
positive.

**Recall** — Of the fields that really are positive, the fraction the model
found.
