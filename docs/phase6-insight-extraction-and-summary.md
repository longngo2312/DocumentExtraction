# Phase 6 — Semantic extraction, grounded inference, document summary

Build guide. Ordered stages, one checklist per file. Rewritten 2026-09-02.

Phases 4–5 built **literal** extraction: find the value, quote it verbatim, verify
the quote exists. That stays. This phase adds **semantic** extraction — the model
answers the question the column description asks, even when the document never
says it in those words.

1. Schema + column descriptions go into the prompt. A description is now *the
   question*, not a hint.
2. Inference becomes evidence-bound: the model may conclude, but cites the passage
   it concluded from.
3. A second, isolated call checks that each conclusion follows from its evidence.
4. A third call writes a document summary, shown in a new Summary tab.

---

## Why Stage 5 exists

Semantic extraction creates a second way to be wrong, and Phase 5 cannot see it:

| | Fabricated evidence | **Unsupported inference** |
| --- | --- | --- |
| What happens | Model invents a passage | Model quotes a **real** passage, draws a conclusion it does not support |
| Example | "Senior Engineer" is nowhere in the CV | Quote: "3 years at Acme building internal tools." Value: `Staff Engineer` |
| `resolveQuote` says | `match_kind: "none"` | `match_kind: "exact"`, `confidence: 0.9` |
| Caught today? | Yes | **No — it passes every existing check, wearing the full provenance badge** |

Quote matching answers *"did this passage exist?"* It cannot answer *"does this
passage support that claim?"* Three signals, stored separately, never blended:

| Column | Question | Answered by |
| --- | --- | --- |
| `confidence` | Does the quote exist in the page text? | `resolveQuote`, deterministic, server-side |
| `llm_confidence` | How strongly does the quote support this answer? | The extracting model, 0..1 |
| `support` | Does the quote support this answer? | **A separate call that sees only the quote** |

`basis` (`stated`/`inferred`/`absent`) routes a field into the grounding check.

The self-report is not enough on its own: it is produced by the same model, in the
same context, immediately after committing to the answer. Stage 5 sees **only the
passage and the claim** — no document, no other fields, no prior reasoning — so it
cannot justify a conclusion from outside the evidence. Keep both; disagreement
between them is itself a signal.

---

## Decisions

| Question | Decision |
| --- | --- |
| Where the summary lives | New `document_summaries` table, 1:1 with `documents`. Not `extracted_values` — that is per-column. |
| Inference vs. the quote invariant | Quote stays verbatim, always. Inference layers on top. |
| Confidence format | Raw 0..1 float, reframed as *"how strongly does my quote support this answer"*. |
| Unsupported conclusions | Grounding check (Stage 5), one batched call per document, inferred fields only. |
| New columns | **Wipe dev data.** No migration helper this phase. |

---

## Token budget

`num_ctx: 8192` in [ollama.ts:40](../api/src/features/extraction/llms/ollama.ts#L40).
qwen2.5-7B costs ~56 KB/token of f16 KV cache, so 12288 forces partial CPU offload
and 16384 does not fit 6 GB. **Leave it at 8192.**

| Segment | Tokens |
| --- | --- |
| System prompt (grown this phase) | ~400 |
| Schema description + field lines | ~50 per column |
| Document at `MAX_INPUT_CHARS = 16000` | ~4300 |
| Output, 6 keys per field instead of 3 | ~110 per column |

12 columns ≈ 6620, fine. 25 columns ≈ 8700 — over, and it fails as silent JSON
truncation. This is why the grounding check is its own call: a fresh 8192 for ~700
tokens, and the isolation is what makes it work.

Guards (implemented in Stage 4):

- [ ] Raise extraction `num_predict` 2048 → 3072.
- [ ] Scale input down as columns rise:

```ts
// ~110 output tokens per column ≈ 440 chars of input surrendered.
const BASE_INPUT_CHARS = 16000;
function inputBudget(columnCount: number): number {
  return Math.max(6000, BASE_INPUT_CHARS - Math.max(0, columnCount - 8) * 440);
}
```

- [ ] Cap `reasoning` at "one sentence, at most 20 words" — the largest output risk.

**Latency:** one call becomes three (extract ~90s → ground ~8s → summarize ~25s) ≈
two minutes per document on the 3050, serial. If that is too slow, cut Stage 6
before Stage 5.

---

## Stage 0 — Reset

`extracted_values` gains four columns and `openTenantDB` will not add them to an
existing file.

- [ ] Stop both dev servers.
- [ ] `rm api/db/tenant/*.sqlite*` and `rm api/db/admin.sqlite*`; empty uploads.
- [ ] Restart, register, re-upload one PDF and one docx (geometry and no-geometry paths).
- [ ] **Build a test schema with a judgment column** — e.g. *"Seniority level:
      junior, mid, senior, or staff+. Judge from years of experience, scope of
      ownership, and whether they led others."* Point it at two CVs, one clearly
      senior and one with 3 years. The second is the only way to see Stage 5 work.

---

## Stage 1 — Storage

### `api/src/db/tenantDb.ts`

Four columns on `extracted_values` ([tenantDb.ts:63-83](../api/src/db/tenantDb.ts#L63-L83)),
all nullable — a model that omits `llm_confidence` must stay distinguishable from
one that answered 0:

```sql
llm_confidence REAL,      -- model's own 0..1, conditioned on its quote
llm_reasoning  TEXT,      -- one sentence: the inference, in words
basis          TEXT CHECK(basis IN ('stated','inferred','absent')),
-- Stage 5 verdict. NULL for stated fields (the quote match is their check) and
-- for inferred fields whose quote never resolved.
support        TEXT CHECK(support IN ('entailed','partial','unsupported','contradicted')),
```

> SQLite cannot alter a CHECK in place. Free now because you are wiping; a fifth
> `support` value later costs a table rebuild.

- [ ] New table in the same `db.exec`:

```sql
CREATE TABLE IF NOT EXISTS document_summaries (
    document_id   INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    overview      TEXT NOT NULL,
    key_findings  TEXT NOT NULL DEFAULT '[]',  -- JSON string[] — parse in consumers
    caveats       TEXT NOT NULL DEFAULT '[]',  -- JSON string[] — parse in consumers
    model         TEXT NOT NULL,
    input_chars   INTEGER NOT NULL,            -- how much text it actually saw
    generated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`key_findings`/`caveats` follow the `enum_options` / `source_boxes` convention:
stringify in, parse at the service boundary, never hand the client a string.

### New: `api/src/features/extraction/sql/documentSummary.sql.ts`

- [ ] `upsert` — `INSERT ... ON CONFLICT(document_id) DO UPDATE SET` every column,
      including `generated_at = datetime('now')`.
- [ ] `getByDocumentId`.

### `api/src/features/extraction/sql/extractedValues.sql.ts`

- [ ] `upsert` — add four columns to the INSERT list, the placeholder tuple (now
      **18**), and `DO UPDATE SET`. **Count the `?` twice**: a mismatch binds
      `basis` into `match_kind` and throws in the worker on document 1.
- [ ] New `setSupport` — Stage 5 writes back after extraction commits:

```sql
UPDATE extracted_values SET support = ?
 WHERE document_id = ? AND column_id = ?;
```

- [ ] `getForReview` — select the four new columns.
- [ ] `updateReviewedValue` — **do not touch**. After a human edits a value, the
      model's confidence, reasoning and verdict still describe what the model did.

---

## Stage 2 — Per-call provider options

[ollama.ts:38-42](../api/src/features/extraction/llms/ollama.ts#L38-L42) hardcodes
`num_predict: 2048` and `LlmRequest.schema` is required. Three callers, three
budgets.

### `llms/dtos.ts`

```ts
export interface LlmOptions {
  temperature?: number;
  num_predict?: number;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  /** Omit for free-form output. Present = Ollama constrains decoding to it. */
  schema?: Record<string, unknown>;
  options?: LlmOptions;
}
```

### `llms/ollama.ts`

- [ ] Spread `request.options` **over** the defaults, so a caller setting only
      `num_predict` keeps `temperature: 0` and `num_ctx`.
- [ ] Send `format` only when `request.schema` is set — `{}` constrains decoding to
      an empty object and returns nothing.
- [ ] `JSON.parse` (line 61) can now fail on truncation. Name it, and leave it
      retryable (no `permanent` flag):

```ts
try {
  return JSON.parse(result.message.content);
} catch {
  throw new Error(
    `Ollama returned unparseable JSON (${result.message.content.length} chars). ` +
    `Most likely num_predict ran out mid-object — see the token budget in ` +
    `docs/phase6-insight-extraction-and-summary.md.`,
  );
}
```

---

## Stage 3 — The prompt learns to reason

### `utils/schemaToJsonSchema.util.ts`

- [ ] New signature:

```ts
export function schemaToJsonSchema(
  columns: SchemaColumns[],
  schemaDescription: string | null,
): SchemaJson;
```

- [ ] Extend `quoteProps` (line 38) from 2 properties to 5:

```ts
const answerProps = {
  quote: { type: ["string", "null"] },
  page:  { type: ["integer", "null"] },
  basis: { enum: ["stated", "inferred", "absent"] },
  confidence: { type: "number" },
  reasoning: { type: ["string", "null"] },
};
```

- [ ] Add all five to each `required` array. Under constrained decoding a
      non-required key is a key the model skips — `confidence` first, it is hardest.
- [ ] Carry the schema description out on `SchemaJson` as `purpose`.

`enum` and `type: "number"` both survive Ollama's schema-to-GBNF conversion (the
enum path is proven at line 47), but guard for a stringified number in Stage 4.

### `services/extraction.service.ts` — SYSTEM_PROMPT

Replace lines 22-31. The current prompt forbids the entire feature ("do not
guess"). The replacement licenses inference while keeping the leap short and
checkable:

```
You extract structured data from documents and draw the specific conclusions the
schema asks for.

Each field description tells you what the client is trying to learn. Answer that
question, not the literal column name. If the description asks for a judgment
("is this candidate senior level?"), make the judgment from what the document
says.

Every conclusion must rest on a passage you can point to. You are not being
asked what is probably true about this subject; you are being asked what this
document establishes.

For every field return all six keys:

1. "value" — the answer. Null only if the document gives you nothing to work
   from.
2. "quote" — a passage copied from the document CHARACTER FOR CHARACTER. Never
   paraphrase, never clean up, never fix a typo. If the value is stated outright,
   quote where it is stated. If you reasoned to the value, quote the passage you
   reasoned FROM — the specific facts, not a heading or a job title. If you have
   no supporting passage, return null with basis "absent".
3. "page" — the page number the quote came from, read from the "--- page N ---"
   markers. Content before the first marker is page 1.
4. "basis" — "stated" if the document says the answer directly, "inferred" if you
   concluded it from other facts, "absent" if the document does not support an
   answer.
5. "confidence" — a number from 0 to 1: how strongly does the passage you quoted
   support this exact answer? Judge the passage, not your overall impression of
   the document. 0.9+ when the passage states the answer outright. 0.5-0.7 when
   it clearly implies it. Below 0.3 when it is merely suggestive. If you would
   not defend this answer using only the passage you quoted, the confidence is
   below 0.5.
6. "reasoning" — one sentence, at most 20 words, naming the evidence and the step
   you took from it. Null when basis is "stated".

Two rules about conclusions:

- When the answer is a level, rank, band or category on a scale, choose the
  LOWEST one the evidence actually establishes. Do not round up. Three years of
  experience is not a staff engineer, however impressive the rest of the document
  sounds.
- A conclusion that needs a fact the document never gives you is not a
  conclusion. Return null with basis "absent" instead.

Inventing a quote is the worst thing you can do. Stretching a real quote past
what it says is the second worst. A null value with basis "absent" beats both.
```

Four load-bearing lines: *character for character* keeps `resolveQuote` a
detector — do not soften it. *Quote the specific facts, not a heading* is what
gives Stage 5 something rulable. *Choose the lowest level* is the cheapest defense
against staff-vs-senior. *Confidence conditioned on the quote* is what makes it
comparable with Stage 5's verdict.

- [ ] Intent block, injected only when the schema has a description. Place it
      **before** the field list:

```ts
function purposeBlock(description: string | null): string[] {
  if (!description?.trim()) return [];
  return ["What this extraction is for:", description.trim(), ""];
}
```

---

## Stage 4 — `extraction.service.ts`

- [ ] Load the schema row for its description (`SCHEMA_SQL.getById` exists, unused here):

```ts
const schema = db.prepare(SCHEMA_SQL.getById).get(documentRecord.schema_id) as
  | DocumentSchema
  | undefined;
```

- [ ] Pass `schema?.description ?? null` to `schemaToJsonSchema`.
- [ ] Replace `MAX_INPUT_CHARS` (line 20) with `inputBudget(columns.length)`.
- [ ] `options: { num_predict: 3072 }`.
- [ ] Extend `readAnswer` (lines 33-50), **keeping its defensive shape** — a
      malformed field returns a safe empty answer rather than throwing:

```ts
// The model can emit "0.85" as a string, or 85, or 1.2. Clamp, do not trust.
function readConfidence(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n > 1 && n <= 100 ? n / 100 : n));
}
```

  - `basis` — only the three literals, else `null`.
  - `reasoning` — string or null, `.slice(0, 300)`.
- [ ] Widen `LlmFieldAnswer` in `models/extraction.model.ts`.
- [ ] Bind the new columns in `upsert.run(...)`, `support` as `null`.
      **Re-count against the placeholder tuple** — better-sqlite3 throws on arity
      mismatch inside the worker's catch and surfaces as a generic failure.
- [ ] Return what Stage 5 needs rather than making it re-query:

```ts
export interface ExtractionOutcome {
  claims: GroundingClaim[];   // inferred fields whose quote resolved
}
export async function extractDocument(
  db: Database.Database,
  documentId: number,
): Promise<ExtractionOutcome>;
```

**Do not auto-repair contradictions.** If `resolveQuote` returns `matchKind:
"none"` while the model claimed `basis: "stated"`, store both as-is — rewriting
`basis` to `absent` erases the only trace of the failure.

---

## Stage 5 — The grounding check

### New: `services/grounding.service.ts`

```ts
export type Support = "entailed" | "partial" | "unsupported" | "contradicted";

export interface GroundingClaim {
  columnId: number;
  question: string;  // the column description — what the client asked
  value: string;     // the conclusion the model reached
  quote: string;     // the verbatim evidence it cited
}

export async function checkGrounding(
  claims: GroundingClaim[],
): Promise<Map<number, Support>>;
```

- [ ] **Which fields go in:** `basis === "inferred"` **and** `match_kind !== "none"`
      **and** non-null value. Stated fields are checked by the quote match; a field
      whose quote never resolved is already flagged and judging a fabricated quote
      is meaningless.
- [ ] **Batch, do not loop.** One call per 8 claims; past that the model loses track
      of which item it is on.
- [ ] **Number claims positionally 1..N — do not send `column_id`.** Map back in TS.
- [ ] **The prompt. Its most important property is what it does NOT contain: the
      document.** The isolation is enforced by what you send; the instruction only
      stops the model filling gaps from its priors.

```
You are checking whether a conclusion is justified by one piece of evidence.

For each item you are given: the question that was asked, the answer that was
given, and one passage from a document.

Judge ONLY the passage. You are not being asked whether the answer is true. You
are being asked whether THIS PASSAGE establishes it. Ignore what you know about
the subject, the wider document, or the world.

Return one verdict per item:

- "entailed"     — the passage establishes the answer. A careful reader would
                   reach the same answer from this passage alone.
- "partial"      — the passage points toward the answer but does not settle it.
- "unsupported"  — the passage is about the right subject but does not justify
                   this specific answer.
- "contradicted" — the passage points to a different answer.

An answer that claims more than the passage shows is "contradicted", not
"partial". If the passage shows three years of experience and the answer says
"staff engineer", that is "contradicted".

Being generous here is a failure. If you have to add a fact of your own to make
the answer work, the verdict is "unsupported".
```

  The staff-engineer case is in the prompt verbatim because a concrete anchor beats
  abstraction for a 7B. "Being generous is a failure" counteracts the helpfulness
  prior that pushes borderline cases up to "partial". `contradicted` is separate
  from `unsupported` because one means "check this yourself" and the other means
  "this is wrong".

- [ ] Output schema:

```ts
const GROUNDING_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          support: {
            enum: ["entailed", "partial", "unsupported", "contradicted"],
          },
        },
        required: ["id", "support"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};
```

- [ ] `options: { num_predict: 400, temperature: 0 }`.
- [ ] **Missing verdicts stay `null`** — never default to `entailed`, which would
      silently pass the fields the model found hardest.
- [ ] Write back via `EXTRACTED_VALUES_SQL.setSupport` in one `db.transaction`.

**The verdict never changes the value.** No auto-correction, no suppression, no
re-extraction — it is surfaced to the human at the review gate.

---

## Stage 6 — The summary call

### New: `services/summary.service.ts`

```ts
export async function summarizeDocument(
  db: Database.Database,
  documentId: number,
): Promise<void>;
```

- [ ] Read parsed text (`DOCUMENT_TEXT_SQL.getByDocumentId`) and extracted rows
      (`EXTRACTED_VALUES_SQL.getByDocument` — already joins `column_name`).
- [ ] Build a compact field table. **Do not send quotes** — they are already in the
      document text and cost ~40 tokens each. **Do send the support verdict**, so
      the summary can be honest about what is shaky:

```
Extracted fields:
- Candidate Name: Dana Ruiz (stated, 0.95)
- Seniority: Senior (inferred, 0.72, evidence: entailed)
- Seniority Rationale: Staff (inferred, 0.88, evidence: CONTRADICTED)
- Security Clearance: (not found)
```

- [ ] `MAX_SUMMARY_CHARS = 10000` — lower than extraction's; the field table and a
      ~500-token output share the window.
- [ ] `options: { num_predict: 700, temperature: 0.2 }`. The warmth is deliberate —
      `temperature: 0` summarization is flat and repetitive. Stays 0 elsewhere.
- [ ] Output schema:

```ts
const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview:     { type: "string" },
    key_findings: { type: "array", items: { type: "string" } },
    caveats:      { type: "array", items: { type: "string" } },
  },
  required: ["overview", "key_findings", "caveats"],
  additionalProperties: false,
};
```

- [ ] **Do not rely on `maxItems`** surviving schema-to-GBNF. Ask for the limit in
      the prompt *and* `.slice(0, 5)` / `.slice(0, 3)` in TS — an unbounded array
      under constrained decoding burns the whole `num_predict`.
- [ ] Prompt:

```
You summarize what a document contained and what the extraction found in it.

Write for someone who has not read the document and is about to review the
extracted values.

- "overview": 2-4 sentences. What kind of document this is, who or what it is
  about, and what it covers.
- "key_findings": at most 5 short bullets. The conclusions a reader should draw
  from the extracted values — patterns, notable values, how fields relate. Not a
  restatement of the field list. Name the field each finding rests on.
- "caveats": at most 3 short bullets. What was missing, ambiguous, or low
  confidence, and what a reviewer should check by hand. Any field marked
  CONTRADICTED or unsupported belongs here.

Base every statement on the document text and the extracted fields given to you.
Do not add outside knowledge. If a field was not found, say so in caveats rather
than speculating about its value.
```

- [ ] Persist via `DOCUMENT_SUMMARY_SQL.upsert` with the real `model` and
      `input_chars` — when a summary reads thin, the first question is whether it
      saw the whole document.

### `models/extraction.model.ts`

- [ ] `DocumentSummaryRow` — raw DB shape, `key_findings`/`caveats` as `string`.
- [ ] `DocumentSummary` — API shape, both as `string[]`.
- [ ] `ReviewPayload.summary: DocumentSummary | null`.

Two types on purpose: every TEXT-holding-JSON column in this codebase has produced
an "it came back as a string" bug.

---

## Stage 7 — Worker wiring

### `worker.ts`

After `extractDocument` (line 109), before the status flips to `extracted`:

```ts
const outcome = await extractDocument(db, job.document_id);

try {
  await runGrounding(db, job.document_id, outcome.claims);
} catch (error) {
  console.error(`[worker] grounding failed for ${job.document_id}:`, error);
}

try {
  await summarizeDocument(db, job.document_id);
} catch (error) {
  console.error(`[worker] summary failed for ${job.document_id}:`, error);
}
```

**Both catches are deliberate:** `failJob` requeues, and a requeued job re-runs
`extractDocument` from the top — an uncaught failure here would re-pay ~90s of GPU
time three times for work that already succeeded.

The cost: a document can reach `extracted` with `support` null everywhere and
nothing saying why. **`support === null` must render as "not verified", never as
"fine"** (Stage 10). That is the whole reason the column is nullable.

---

## Stage 8 — Serving it

### `services/review.service.ts`

- [ ] In `getReviewPayload`, read `DOCUMENT_SUMMARY_SQL.getByDocumentId`, parse
      `key_findings`/`caveats`, return `summary` or `null`. It rides the existing
      payload (~1 KB) rather than a new endpoint — a second fetch buys a second
      loading state and nothing else.
- [ ] Map the four new field columns into `ReviewField`.
- [ ] **Staleness:** `saveReview` flips to `reviewed`, but the summary was written
      against pre-review values. Do not regenerate there — that is a 25s model call
      in a click handler. Compare `document_summaries.generated_at` against
      `extracted_values.reviewed_at` in the UI and label it.

### Optional

- [ ] `POST /api/documents/:id/summary` → `summarizeDocument`, synchronous ~25s.
      Enqueuing instead needs a `job_type` column on `extraction_jobs` — a real
      migration. Deferring is reasonable.

---

## Stage 9 — Frontend types

### `frontend/src/types/index.ts`

- [ ] `Basis = "stated" | "inferred" | "absent"`.
- [ ] `Support = "entailed" | "partial" | "unsupported" | "contradicted"`.
- [ ] On `ReviewField`: `basis`, `support`, `llm_confidence`, `llm_reasoning`.
      Comment the three-way distinction — the existing comment on `confidence`
      (line 112) reads as if it were the only score.
- [ ] `DocumentSummary { overview, key_findings, caveats, model, input_chars,
      generated_at }`; `ReviewPayload.summary`.

### `frontend/src/api/documents.ts`

No change — `getReview` already returns the whole payload.

---

## Stage 10 — The UI

**Naming warning.** `components/extraction/ExtractionSummary.tsx` already exists
and is the review *progress header* (filename, % reviewed, Save). Do not extend it
or name anything near it.

### `frontend/src/utils/extractedValue.ts`

`formatConfidence` (line 21) renders the quote-match score at
[SourceQuoteCell.tsx:136](../frontend/src/components/extraction/SourceQuoteCell.tsx#L136).
Leave it. Add:

```ts
// The 7B's float is not calibrated to two digits — "82%" implies precision it
// does not have.
export function confidenceBand(c: number | null): "high" | "medium" | "low" | null {
  if (c === null) return null;
  return c >= 0.8 ? "high" : c >= 0.5 ? "medium" : "low";
}

export type Flag = "fabricated" | "contradicted" | "unsupported" | "unverified";

/**
 * The two hallucinations, named separately: "fabricated" = the quote is not in
 * the document. "contradicted" = the quote is real and says something else.
 */
export function flagFor(field: ReviewField): Flag | null {
  if (field.match_kind === "none" && (field.llm_confidence ?? 0) >= 0.8) {
    return "fabricated";
  }
  if (field.support === "contradicted") return "contradicted";
  if (field.support === "unsupported") return "unsupported";
  // Inferred, but the grounding call never ran. NOT the same as passing.
  if (field.basis === "inferred" && field.support === null) return "unverified";
  return null;
}
```

- [ ] A flagged field must be visually distinct in the list **before** the reviewer
      opens it. `STATUS_BORDER_COLOR` in `ExtractedValueRowItem.tsx` keys off review
      status only; flagged rows need their own accent. If a contradicted inference
      looks like every other row, none of Stage 5 reached a human.

### `components/extraction/ReviewPanel.tsx`

- [ ] `const [tab, setTab] = useState<"fields" | "summary">("fields")`.
- [ ] `<Tabs>` **inside the sticky header Box** (lines 40-61), below
      `<ExtractionSummary>`, so Save and the progress ring stay visible on both.
- [ ] Scrollable area (line 64) switches on `tab`.
- [ ] Accept `summary: DocumentSummary | null`.
- [ ] Flagged-field count as a `<Badge>` on the Fields tab label.

> `SplitPane` already collapses to Document/Extracted tabs under `md`, so mobile
> gets two rows of tabs. Acceptable — clearly different levels — but if it reads
> badly, lift the summary to a third `SplitPane` tab rather than hiding it.

### New components

Per CLAUDE.md, split rather than one long file:

- [ ] `SummaryTab.tsx` — three real states: `null` + `processing` → "Being
      generated"; `null` + `extracted`/`reviewed` → **"No summary was generated for
      this document"** (Stage 7's swallowed error, not a spinner that never
      resolves); present → render.
- [ ] `SummarySection.tsx` — titled bullet list, used for findings and caveats.
- [ ] `SummaryMeta.tsx` — model, `generated_at`, staleness chip: *"Generated before
      review — values may have changed since."*
- [ ] `InferenceNote.tsx` — per field, under the value. `basis`, `llm_reasoning`,
      `confidenceBand`, `support`. **Render nothing when `basis === "stated"` and
      reasoning is null** — the common case; empty chips on every row make the
      table unreadable.
- [ ] `GroundingChip.tsx` — four states plus null; the null state says **"not
      verified"**, not nothing. `contradicted` reads as error, `unsupported` as
      warning.

---

## Verification

- [ ] **Arity.** One document through with no `RangeError`. The `?` count in
      `EXTRACTED_VALUES_SQL.upsert` is the likeliest single defect in this phase.
- [ ] **Row shape.** `SELECT * FROM extracted_values` — `basis` one of three
      literals, `llm_confidence` a number, `llm_reasoning` and `support` null on
      stated fields, `support` non-null on inferred ones.
- [ ] **The staff-engineer test.** Run the 3-years CV against the seniority column:
      1. Does extraction return `Senior`/`Mid` rather than `Staff`?
      2. If it says `Staff`, does Stage 5 return `contradicted`? **This is the
         acceptance criterion — the model getting it wrong is fine, the system
         failing to notice is not.**
      3. Does the flag reach the review screen without opening the row?
- [ ] **Isolation.** Log the grounding prompt once, confirm the document text is not
      in it. If that leaks, the check degrades into a second extraction.
- [ ] **The judge is not a rubber stamp.** Hand-build one obviously good and one
      obviously bad claim. If both come back `entailed`, everything built on
      `support` is decoration.
- [ ] **Confidence spread.** One explicit and one inferred field. If both return
      0.9+, the prompt anchors are not working — fix before building UI on a constant.
- [ ] **The old invariant.** A `basis: "inferred"` field's quote is still findable
      verbatim and still highlights in the PDF.
- [ ] **Budget ceiling.** ~20 columns with descriptions: either it completes or it
      throws the Stage 2 error. A silently half-populated field set must not happen.
- [ ] **Degradation.** Temporarily `throw` at the top of `checkGrounding`, then
      `summarizeDocument`. The document still reaches `extracted`, fields populate,
      inferred fields show "not verified", Summary tab shows its empty state.
- [ ] **Office path.** One docx — `source_boxes` is null, so it exercises the
      fallback. Grounding and summary populate identically.

---

## Standing risks

- **The judge shares the extractor's blind spots.** Same weights, so a misconception
  it holds while answering it may hold while judging. Isolation fixes anchoring, not
  knowledge. If the staff-engineer test fails at step 2, swap in a larger model over
  the API for this one tiny call — keeping `checkGrounding` behind `LlmProvider` is
  what keeps that a one-file change.
- **The float will probably be flat.** Expect `llm_confidence` to cluster at
  0.85–0.95 regardless of truth. Survivable because `support` is independent.
  `confidenceBand` is written so switching to enum buckets costs nothing.
- **The column description is now a prompt, and nothing tells users that.** A vague
  description used to produce a null; now it produces a confident inference.
  `SchemaBuilder.tsx` should say so, and judgment columns should state their
  criteria ("senior = 5+ years or team leadership"). Cheapest quality lever here.
- **`num_ctx: 8192` is the ceiling.** The next feature wanting prompt space takes it
  from `MAX_INPUT_CHARS`, meaning the model sees less document. Separate calls are
  the escape hatch.
- **Two minutes per document, serial.** Fine for one user; first thing to break with three.
- **Summaries go stale on review.** Labeled, not solved.

## Out of scope

- Regenerating summaries on review save.
- Grounding checks on `stated` fields — the quote match is their check.
- Auto-correcting or suppressing contradicted values — the human gate decides.
- Cross-document summaries or comparison.
- Anything touching the chunk/embed/index path.
