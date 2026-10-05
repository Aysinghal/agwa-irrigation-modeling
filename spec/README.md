# Documentation System

This file defines how this repository is documented: what goes where, how files
are named and cross-referenced, and the rules every other document follows. It
governs both `spec/` and `research-log/`.

It is itself a spec file, so it is mutable — but changes to it need team
agreement, not a single-author edit.

## Start here

New to the project, read in this order:

1. `spec/problem-statement.md` — what we are solving
2. `spec/glossary.md` — the vocabulary
3. `spec/data.md` — where the training data came from
4. `spec/assumptions.md` — what the project currently stands on
5. `spec/model.md` and `spec/evaluation.md` — what we are building and how we judge it
6. `spec/decisions/` — the choices already made, and what they cost

You do not need to read `research-log/` to work on the project. Read it when you
want to know *why* the spec says what it says.

## The two piles

Every document here belongs to one of two piles. Keeping them separate is the
entire point of this system.

**`spec/` is mutable.** It describes what is true *right now*. Present tense.
When we learn something, we rewrite the file — the file carries no history of
its own, because git already does. Someone joining the team in six months reads
only this pile and knows how to run the project.

**`research-log/` and `spec/decisions/` are immutable.** They describe what
happened on a specific date. Past tense. Once merged, an entry is never edited.
If it turns out to be wrong, we write a *new* entry that says so and link the
two.

The test for where something goes: **if it would change when we learn something,
it is spec. If it is a thing that happened, it is record.**

A spec without a record is untrustworthy — it asserts things with no evidence. A
record without a spec is unusable — it forces the reader to replay history to
find out what is currently true. We keep both, strictly separated, with pointers
between them.

## Directory map

| Path | Pile | Contents |
|---|---|---|
| `spec/README.md` | spec | This file. The rules. |
| `spec/problem-statement.md` | spec | What we are solving, research questions, scope boundary, what counts as success, what is out of scope. |
| `spec/assumptions.md` | spec | Every load-bearing assumption, with an ID, rationale, risk if wrong, and current status. |
| `spec/data.md` | spec | How the training set was built: provenance, labeling protocol, composition, known biases. A datasheet. |
| `spec/model.md` | spec | Task formulation, input features, architecture, training procedure. |
| `spec/evaluation.md` | spec | Metrics, split construction, baselines, and success thresholds — written *before* results exist. |
| `spec/pipeline.md` | spec | Where every artifact physically lives and how data moves between systems. |
| `spec/glossary.md` | spec | Domain and project vocabulary. |
| `spec/open-questions.md` | spec | Undecided things, and parked work. Items graduate off this list into decisions. |
| `spec/decisions/` | record | One ADR per decision. Never edited; superseded. |
| `research-log/` | record | One entry per experiment or investigation. Dated, append-only. |
| `gee/labeling/` | record | Vendored Earth Engine code that built the dataset. Never modified in place. |
| `gee/export/` | code | Scripts that pull assets out of Earth Engine. |
| `scripts/` | code | Local processing. Builds the label table. |
| `data/` | data | The labels, and the exports they are built from. See below. |
| `CLAUDE.md` | code | Points Claude Code at this file. |

## ID conventions

Stable IDs make cross-references precise. Use them everywhere.

| Kind | Format | Example | Assigned |
|---|---|---|---|
| Assumption | `A-NN` | `A-07` | Next free number in `assumptions.md` |
| Decision | `D-NN` | `D-03` | Next free number in `spec/decisions/` |
| Open question | `Q-NN` | `Q-02` | Next free number in `open-questions.md` |
| Log entry | `YYYY-MM-DD-slug` | `2026-09-04-baseline-rf-ndvi` | The entry's own filename |

Log entries are identified by their filename rather than a number. Seven people
writing concurrently would collide on sequential IDs constantly; date-slugs
never collide, need no coordination, sort chronologically, and describe
themselves. `A-NN` and `D-NN` stay numbered because they are rarer and more
deliberate — resolve the occasional collision in review.

**IDs are permanent.** A number is never reused or reassigned, and removing an
item leaves a gap rather than triggering a renumber. This matters most for open
questions, which come off the list once resolved: an ADR recording that it
resolved `Q-03` has to keep meaning the same thing forever.

Reference IDs inline and bare: "supersedes `D-03`", "refutes `A-07`", "see
`2026-09-04-baseline-rf-ndvi`". Do not restate what the referenced item says.

**Status vocabulary**, used by assumptions and decisions:

- Assumptions: `untested` / `supported` / `refuted` / `retired`
- Decisions: `accepted` / `superseded by D-NN`

## Writing rules

### All files

**No YAML frontmatter.** A metadata block costs every reader a few lines at the
top of every file, in exchange for tooling we do not have. Anything that would
go in frontmatter belongs in the filename, in git, or in the document body:

- **Date and author** — git records both, and a log entry's date is already its
  filename.
- **Last updated** — git knows. A hand-maintained timestamp goes stale within a
  month and then actively misleads.
- **Status** — where status is load-bearing, it is content, not metadata. An
  ADR states it in a `## Status` section; an assumption states it in its own
  entry in `assumptions.md`.

Every file opens with a single `#` title and goes straight into prose.

### Spec files

- **Say it once, in as few words as it takes.** Every sentence a reader does
  not need is a sentence that can go stale. A number and a link beats a
  paragraph explaining the number.
- **Present tense.** Describe what is true now, not how it came to be true. No
  no narrating how a value changed — state the current figure, not the figure
  it replaced.
  The log holds the change; the spec holds the state.
- **One fact, one home.** Each fact lives in exactly one file; everywhere else
  links to it. The moment a threshold is stated in two files, they will disagree
  within a month.
- **Every claim traces to something.** A citation, a log entry, or an assumption
  ID. A claim that traces to none of these is an unexamined assumption and
  belongs in `assumptions.md` instead.
- **No raw results.** Results live in `research-log/`. `evaluation.md` may hold
  a small current-best table that points at the entries producing those numbers.

### Log entries

Filename: `research-log/YYYY-MM-DD-slug.md`, kebab-case slug.

Sections, in this order, and **no others**:

| Section | Holds |
|---|---|
| `## Question` | What we are trying to find out. |
| `## Hypothesis` | What we expect. Written before running. |
| `## Setup` | Data, config, commit hash. Enough to reproduce. |
| `## What happened` | Results. Including the failures. |
| `## Interpretation` | What we think it means. |
| `## What this changes` | Spec files and IDs affected. See "The loop". |
| `## Next` | Or "nothing" — an honest dead end is a valid ending. |

The rules that keep this readable with seven authors:

1. **One entry, one question.** If you did three things, write three entries.
   This rule is what prevents "worked on the classifier today" blobs. Everything
   else is downstream of it.
2. **Fixed headings.** The sections above are the complete set. If your content
   does not fit under one of them, it does not belong in the entry.
3. **Never restate the spec.** Reference by ID and move on. No background
   paragraphs re-explaining what the model is or why a threshold is what it is.
4. **Roughly one screen of prose.** Tables and figures excluded. If the body
   runs long, you are probably restating the spec or answering two questions.
5. **Immutable once merged.** The only permitted edit is adding a single
   `> Superseded by YYYY-MM-DD-slug` line directly under the title.
6. **Observation and interpretation stay separate.** "What happened" holds
   numbers and behaviour. "Interpretation" holds what you think they mean.
   Collapsing them is how a result quietly becomes a story.
7. **Record the failures.** An experiment that did not work is an entry. Most of
   the value in a research log is in the things that did not pan out.

If nothing was learned, there is no entry. The log is not a diary.

### Decisions (ADRs)

Filename: `spec/decisions/D-NN-slug.md`.

Sections: **Status** (`accepted`, or `superseded by D-NN`), **Context** (what
forced a choice), **Options considered** (including rejected ones, with why),
**Decision**, **Consequences** (what this commits us to, and what it costs).

Never edit a merged ADR. To reverse a decision, write a new one whose Context
names the old, and set the old one's status to `superseded by D-NN`. The old
file stays — a decision we walked back is part of the record.

## The loop

The two piles are not maintained in parallel. They cycle:

1. `evaluation.md` states what we will test and what success looks like, before
   we run it.
2. We run it. A log entry records what happened.
3. The entry's **What this changes** section names the specific spec files and
   IDs affected.
4. Those spec files are updated, and the updated claim cites the entry that
   produced it.

Step 3 is the hinge. Without it, the log becomes a diary nobody reads and the
spec silently drifts out of date.

## Review

- **Spec changes** go through a pull request, reviewed by at least one other
  person.
- **Log entries** go through a pull request, but the review checks *format*
  only — that it follows the rules above. Nobody peer-reviews another person's
  observation of what happened. Disagreement about interpretation is itself
  worth a new entry.
- **ADRs** need agreement from whoever the decision affects before merging.

## What does not belong in this repository

- **Meeting notes.** The log is for questions and answers, not attendance.
- **Task tracking.** `open-questions.md` holds open *research* questions. Work
  items go in issues.
- **Water-balance work.** Separate repository. See `problem-statement.md`.
- **Data that can be regenerated.** The hand-drawn labels are committed, under
  `data/raw/`, because nothing can rebuild them and a distributed copy is the
  only real backup. Everything else stays out: imagery, and any Earth Engine
  asset the vendored scripts reproduce deterministically. `pipeline.md` records
  what lives where.
- **Personal scratch work.** Notebooks and one-off scripts that are not part of
  a reproducible result.
- **Versioned filenames.** No `model-v2-final.md`. Git is the history.
