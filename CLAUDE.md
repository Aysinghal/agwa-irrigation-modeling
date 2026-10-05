# Working in this repository

`spec/README.md` defines how this repository is documented and governs every
file in `spec/` and `research-log/`. Read it before writing either. It is the
authority; this file only flags what is easiest to get wrong.

## The two piles

`spec/` is mutable and present-tense: what is true now. `research-log/` and
`spec/decisions/` are immutable and dated: what happened. A log entry is never
edited once merged.

## What goes wrong most

**Writing history into the spec.** The spec states the current value. How it got
there, what it was before, and which run measured it all belong in the log,
referenced by ID. "881 positives" — not "714 under the old rule, 881 now".

**Restating a fact in two files.** Each fact has one home; everywhere else links
to it. Updating the same number in three files means it was written in three
files, which is the bug. Delete the copies instead.

**Length.** Shorter is better everywhere. Log entries run about one screen of
prose. Spec sections should be as short as accuracy allows — no preamble, no
restating what another file says, no justifying a decision the ADR already
justifies.

**Skipping the hinge.** A log entry's *What this changes* names the spec files
and IDs affected. Those edits then have to actually happen, as a separate
reviewed change. An assumption named as refuted but left at `untested` is the
failure this guards against.
