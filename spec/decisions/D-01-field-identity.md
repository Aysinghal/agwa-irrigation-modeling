# D-01 — A field is identified by its centroid

## Status

accepted

## Context

Nothing in this project currently identifies a field.

`gee/labeling/build_cdl_fields.js` states in its header that it "assigns a
stable field_id". It does not. The exported features carry `area_m2` and
`label_year` and nothing else, so the documentation describes an identifier that
was never written.

Two things have been filling the gap, and they disagree.

`system:index` is Earth Engine's own row identifier. It is assigned at export
time and is not stable across separate exports of the same data.
`gee/labeling/negative_assignment.js` says so in a comment and works around it.

That workaround is the second thing: a key built from the field's centroid,
rounded to roughly 0.1 m and joined as `lon_lat`. It exists in one script, is
used once, and is not carried into any exported asset.

Separately, `negative_assignment.js` sets a property named `field_id` whose
value is the position in the negative labeling queue, 0 to 999. It identifies a
queue slot rather than a field, exists only for the thousand sampled candidates,
and collides in name with the identifier this decision is about.

The choice is forced now because Script 9 rebuilds the positive set with
provenance attached and has to write an identifier column. Everything
downstream — the split file, the benchmark's join between predictions and
labels, and inference over every field in Maryland — depends on which kind it
writes.

This was never on the open-questions list. Nobody had noticed it was undecided.

## Options considered

**Earth Engine's `system:index`.** Free and already present. Rejected: it is
assigned per export, so the same field carries different values in different
files. Our own code already distrusts it.

**A sequential counter assigned at export.** Simple and readable. Rejected for
the same underlying reason — it depends on the order features happen to come
out. Re-export in a different order and every identifier shifts, silently. A
benchmark joining predictions to labels on a shifted counter produces a
plausible, wrong scorecard with nothing to signal the error.

**A counter plus a stored lookup table.** Fixes stability by recording the
mapping. Rejected because the lookup table then becomes an irreplaceable
artifact that must be kept correct forever, and inference over fields that were
never in it has no entry to look up.

**A key derived from the field's geometry.** Chosen. It depends on nothing but
the field itself, so it needs no coordination, no ordering, and no lookup.

## Decision

A field's identifier is its centroid, in decimal degrees, multiplied by 10⁶,
rounded to the nearest integer, and joined as `<lon>_<lat>`:

```
-75831204_38472910
```

This is the convention already present in `negative_assignment.js`, promoted
from a local workaround to the project-wide identifier. It is written as
`field_id` on every exported field, by Script 9 and by everything after it.

The queue position in `negative_assignment.js` is renamed `queue_index`, freeing
the name.

At 10⁶ the rounding step is about 0.11 m. Fields have a 1-hectare floor, so two
distinct fields cannot share a centroid at that precision. Code that writes
identifiers asserts uniqueness rather than assuming it.

## Consequences

**The same field gets the same identifier everywhere, with no bookkeeping.**
This is the property the decision exists for. A field exported for training
today and scored during statewide inference next year resolves to one identifier
in both, because `build_cdl_fields.js` is deterministic and the centroid is a
function of the polygon. No join table, no export ordering to preserve, no
mapping to maintain.

**The identifier is tied to the field definition, not just to the location.**
Changing `MIN_FIELD_AREA_M2`, the consensus years, or the vectorization scale
produces different polygons, different centroids, and therefore different
identifiers. This is correct — those are different fields — but it means labels
are bound to the field definition that produced them. A change to
`build_cdl_fields.js` invalidates every existing identifier and is a dataset
migration, not a parameter tweak.

**It is tied to the CDL vintage.** USDA occasionally reissues past years. A
reissued 2021–2023 CDL would shift boundaries and rebuild identifiers. The
vintage used is recorded in `pipeline.md` so a future mismatch is diagnosable
rather than mysterious.

**Identifiers are long and not human-friendly.** `-75831204_38472910` is worse
to read and type than `47`. Accepted: identifiers are read by code far more
often than by people, and the coordinate form at least points at a place on a
map, which a counter does not.

**Two existing things must change.** The false claim in the header of
`build_cdl_fields.js` is corrected, and `field_id` in `negative_assignment.js`
becomes `queue_index`. Neither script is rerun; both outputs already exist and
are unaffected. Per `pipeline.md` the vendored labeling code is a record of how
the dataset was made, so these are corrections to a description, not changes to
behaviour.
