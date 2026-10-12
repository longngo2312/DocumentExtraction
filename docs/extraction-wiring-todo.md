# TODO — wire the LLM into the pipeline

**Goal:** upload a document, and when the worker finishes, `extracted_values`
has one row per schema column with a real answer in it, and the document's
status is `extracted`.

**In scope:** the DB table, value coercion, the extraction service, the worker
call.

**Out of scope, deliberately:** quotes/provenance (`resolveQuote.ts`), the
review UI, and the API endpoint that serves values to the frontend. Those come
after you have seen what the 7B actually produces. The table you build in
Stage 1 has the quote columns in it already so you don't rebuild it later — you
just leave them NULL for now.

Work the stages in order. Stage 5 imports from 2, 3, and 4.

---

## Stage 0 — reset the dev databases

`openTenantDB` only runs `CREATE TABLE IF NOT EXISTS`, so DDL changes to an
existing table are silently ignored. You are pre-users, so delete and recreate
rather than writing migration code.

- [x] Stop the API server.
- [x] `rm api/db/tenant/*.sqlite*` — the trailing `*` catches the `-wal` and
      `-shm` files.
- [x] `rm api/db/admin.sqlite*` too. You'll re-register anyway, and a stale
      `users.tenant_db_path` pointing at a deleted file is confusing.
- [x] Delete the uploaded files under wherever `resolveStoragePath` points, so
      you don't accumulate orphans.

After Stage 1 you'll restart, register a fresh user, rebuild one test schema,
and re-upload one test document.

---

## Stage 1 — `api/src/db/tenantDb.ts`

### 1a. Drop the CHECK on `documents.status`

The current DDL ([tenantDb.ts:43-44](../api/src/db/tenantDb.ts#L43-L44))
hard-codes four statuses. You will need `reviewed` and `indexed` in the next two
phases, and SQLite cannot alter a CHECK in place — changing it means a full
table rebuild with four foreign keys pointing at it.

- [x] Remove the `CHECK(status IN (...))` clause. Keep `NOT NULL DEFAULT 'uploaded'`.
- [x] The status union in
      [document.model.ts:8](../api/src/features/document/models/document.model.ts#L8)
      becomes the only enforcement. Widen it now:
      `"uploaded" | "processing" | "extracted" | "reviewed" | "indexed" | "failed"`.

Every future status is then free.

### 1b. Replace `extractedDocumentText`

The current table ([tenantDb.ts:60-70](../api/src/db/tenantDb.ts#L60-L70))
cannot hold this data: it keys on `schema_id` instead of `column_id`, so
`UNIQUE(document_id, schema_id)` allows exactly one row per document when you
need one per field; and `value_text`/`value_number` are both `NOT NULL`, so
every row would have to be a string and a number at once. Nothing has ever
written to it.

- [x] Add `DROP TABLE IF EXISTS extractedDocumentText;` at the top of the
      `db.exec()` block. Harmless on a fresh DB, and it cleans up any tenant DB
      you forgot to delete in Stage 0.
- [x] Add the new table:

```sql
CREATE TABLE IF NOT EXISTS extracted_values (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES schema_columns(id) ON DELETE CASCADE,

    -- What the model said, frozen at extraction time. Never overwritten by a
    -- human edit. This is what lets you measure accuracy per column later.
    llm_value      TEXT,
    llm_quote      TEXT,          -- stays NULL until you build resolveQuote

    -- The working value. Seeded from llm_value, edited in the review UI later.
    value_text     TEXT,
    value_number   REAL,
    value_date     TEXT,

    -- All NULL until the quote work. Offsets are into
    -- pages_json[source_page-1].text, not the PDF text layer.
    source_page    INTEGER,
    source_start   INTEGER,
    source_end     INTEGER,
    match_kind     TEXT CHECK(match_kind IN ('exact','normalized','none')),
    confidence     REAL,

    review_status  TEXT NOT NULL DEFAULT 'unreviewed'
                   CHECK(review_status IN ('unreviewed','accepted','edited','rejected')),
    reviewed_at    TEXT,

    UNIQUE(document_id, column_id)
);
CREATE INDEX IF NOT EXISTS idx_values_document ON extracted_values(document_id);
```

`UNIQUE(document_id, column_id)` is what makes re-extraction an upsert instead
of a duplicate-row bug.

**Gotcha:** the existing `idx_values_document` index belongs to the old table.
Dropping that table drops its index, so reusing the name is fine — but the
`DROP TABLE` has to come before the `CREATE INDEX` in the exec block, or the
create runs against the doomed table.

---

## Stage 2 — `api/src/features/extraction/models/extraction.model.ts`

- [x] Delete the `ExtractedText` interface. It describes the dead table:
      `schema_id` instead of `column_id`, non-nullable values.
- [x] Add the row type:

```ts
export type ReviewStatus = "unreviewed" | "accepted" | "edited" | "rejected";
export type MatchKind = "exact" | "normalized" | "none";

export interface ExtractedValue {
  id: number;
  document_id: number;
  column_id: number;
  llm_value: string | null;
  llm_quote: string | null;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  source_page: number | null;
  source_start: number | null;
  source_end: number | null;
  match_kind: MatchKind | null;
  confidence: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
}
```

- [x] Add the shape the model returns, so `extractionService` has something to
      narrow `unknown` into:

```ts
/** One property of the LLM's JSON response. Every field is untrusted. */
export interface LlmFieldAnswer {
  value: string | null;
}
```

**Decision point.** You could keep the LLM returning a bare `string | null` per
field today and nest it into an object when you add quotes. I'd nest it now:
the change in `schemaToJsonSchema` is three lines, and it means the
result-reading loop in `extractionService` doesn't get rewritten in two weeks.

If you nest it, `schemaToJsonSchema` line 43 and line 50
([schemaToJsonSchema.ts:37-53](../api/src/features/extraction/schemaToJsonSchema.ts#L37-L53))
each become an object property:

```ts
{
  type: "object",
  properties: { value: /* the enum or string|null you have today */ },
  required: ["value"],
  additionalProperties: false,
}
```

The enum constraint just moves down one level onto `.value`. Don't lose it in
the refactor — it's the one piece of correctness the grammar gives you for free.

---

## Stage 3 — `api/src/features/extraction/coerce.ts` — new

The model returns strings for everything. This turns them into typed columns.
It gets called twice in the finished system: once on the model's output, once on
a human's edit in the review UI. Pure function, no DB, easy to test.

```ts
import type { SchemaColumns } from "../schema/models/schema.model.js";

export interface CoercedValue {
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
}

export function coerce(
  raw: string | null,
  dataType: SchemaColumns["data_type"],
  enumOptions: string[] | null,
): CoercedValue;
```

- [ ] Write it. Rules per `data_type`:

| `data_type` | Lands in                            | Rules                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`      | `value_text`                        | trim; empty string → null                                                                                                                                                                                                                                                |
| `number`    | `value_number` **and** `value_text` | strip currency symbols, thousands separators, whitespace; then `Number()`. `NaN` → both null. **Keep the original string in `value_text`** — that's what the UI shows, and a reviewer who sees `1234.56` where the document said `$1,234.56` thinks the model mangled it |
| `date`      | `value_date`                        | normalize to `YYYY-MM-DD`; unparseable → null                                                                                                                                                                                                                            |
| `boolean`   | `value_text` as `"true"`/`"false"`  | accept yes/no/true/false/y/n/1/0, case-insensitive; anything else → null                                                                                                                                                                                                 |
| `enum`      | `value_text`                        | must be in `enumOptions` — compare case-insensitively, store the canonical casing from `enumOptions`; otherwise null                                                                                                                                                     |

- [x] **Never throw.** Every failure path returns nulls. One unparseable field
      must not sink the other nine, and later it must not 500 the review save.

### The date gotcha, in detail

Do not pass arbitrary strings to `new Date()`. `03/04/2026` is March 4th or
April 3rd and nothing in the string tells you which. Match explicit patterns,
return null when none fit:

- [x] `YYYY-MM-DD` → accept as-is.
- [x] `MM/DD/YYYY` and `M/D/YYYY` → accept as US order. **Write that assumption
      in a comment.** It's a real decision, not an oversight, and future-you
      will wonder.
- [x] `Month D, YYYY` and `D Month YYYY`, full and 3-letter month names →
      accept. These are unambiguous, and it's what invoices actually print.
- [x] Anything else → null.

Validate that the result is a real date — reject `2026-02-30` — before returning.

---

## Stage 4 — `api/src/features/extraction/sql/extractedValues.sql.ts` — new

```ts
export const EXTRACTED_VALUES_SQL = {
  upsert: `...`,
  getByDocument: `...`,
};
```

- [x] `upsert` — insert `(document_id, column_id, llm_value, value_text,
value_number, value_date)` with
      `ON CONFLICT(document_id, column_id) DO UPDATE SET ...`.

**The important part of the upsert:** on conflict, also reset
`review_status = 'unreviewed'` and `reviewed_at = NULL`. Without that, a
re-extraction produces a brand-new model answer still carrying the old
"accepted" flag, and the review UI hides a value nobody has looked at.

- [x] `getByDocument` — join `schema_columns` for `name`, `data_type`, and
      `position`; order by `schema_columns.position`. The worker doesn't need
      it, but you need it in ten minutes to check your work, and next week for
      the API endpoint.

Also needed, so the service can read the parsed text back:

- [x] Add to `api/src/features/extraction/sql/documentText.sql.ts`:
      `getByDocumentId: "SELECT * FROM parsedDocumentText WHERE document_id = ?;"`

---

## Stage 5 — `api/src/features/extraction/extractionService.ts` — new

```ts
import type Database from "better-sqlite3";

export async function extractDocument(
  db: Database.Database,
  documentId: number,
): Promise<void>;
```

**Takes the open tenant DB handle, not a `userId`.** The worker already has a
connection open for this job; opening a second one against the same SQLite file
mid-job is how you meet `SQLITE_BUSY`.

- [x] Load the document via `DOCUMENT_SQL.getById` to get its `schema_id`.
- [x] Load columns via `SCHEMA_SQL.getColumnsBySchemaIdOrdered`.
- [x] **No columns → return.** A schema with zero columns is a no-op success,
      not an error.
- [x] Load the `parsedDocumentText` row using the SQL from Stage 4. A missing
      row should throw — the worker wrote it seconds ago, so its absence is a
      real bug, not a data condition.
- [x] `schemaToJsonSchema(columns)` → `{ schema, keyToColumnId, fieldLines }`.
- [x] Truncate `text` to `MAX_INPUT_CHARS = 16000` (module const).
- [x] Build the prompt (below), then
      `await OllamaProvider.complete({ system, prompt, schema })`.
- [ ] Loop `keyToColumnId`, coerce, upsert — inside a `db.transaction(...)`.

### Prompt shape

Keep it boring. A 7B rewards boring.

```
system: You extract structured data from documents. Use only information that is
present in the document. If a field is not stated in the document, return null
for it. Do not guess.

user:   Fields to extract:
        <fieldLines, one per line>

        Document:
        <triple-quoted truncated text>
```

- [ ] `fieldLines` must go in the **prompt text**, not just the JSON schema.
      Ollama's `format` compiles to a decoder grammar that the model never
      reads — it forces the shape of the output and communicates nothing about
      meaning. If your column descriptions only live in the schema, you get
      perfectly-formed JSON full of nulls.

### Gotchas in the result loop

- [x] **Iterate `keyToColumnId`, not `Object.keys(result)`.** A key the model
      invented has no column to write to; a key it skipped still needs a null row.
- [x] The provider returns `unknown`. Narrow before indexing: reject
      non-objects, and per field take `typeof v === "string" ? v : null`. The
      grammar should prevent a number coming back, but "should" is doing a lot
      of work there and `.trim()` on a number throws.
- [x] `enum_options` comes out of SQLite as a raw JSON string. Parse it once per
      column before the loop and pass the array to `coerce`. It's already parsed
      separately inside `schemaToJsonSchema` — that duplication is fine, don't
      refactor around it now.
- [x] Write `llm_value` = the raw string the model returned, before coercion.
      That column is your only record of what actually happened when a value
      looks wrong later.
- [x] Wrap the whole loop in one transaction. Ten separate writes on a WAL DB is
      ten fsyncs for no reason, and a crash mid-loop leaves a half-extracted
      document that looks complete.

---

## Stage 6 — `api/src/features/extraction/worker.ts`

In `runJob`, after the `DOCUMENT_TEXT_SQL.upsert` call
([worker.ts:76-83](../api/src/features/extraction/worker.ts#L76-L83)) and before
`completeJob(job.id)`:

- [x] `await extractDocument(db, job.document_id);`
- [x] `db.prepare(DOCUMENT_SQL.updateStatus).run("extracted", job.document_id);`
- [x] Delete the two-line comment above `completeJob` that says extraction
      hasn't happened yet.

### Bug to fix while you're in this file

[ollama.ts:31](../api/src/features/extraction/llms/ollama.ts#L31) sets
`(err as any).permanent = true` on a 404 — model not pulled — but the catch in
`runJob` only checks `ParsingError` codes, so that flag is ignored. An unpulled
model burns all three attempts, several minutes of retries, and then reports it
as a parse failure.

- [] Add the LLM case to the `permanent` test in the catch. Quick version: also
      read `(error as any).permanent === true`. Better version: give the
      provider a real `LlmError` class with a `permanent: boolean` field and
      `instanceof` it — about 8 lines, and it removes the `any`. Your call.

### Known cost, not a bug

A retryable extraction failure (Ollama down) requeues the whole job, which
**re-parses the document from scratch** — including OCR, which is the expensive
part. Acceptable for now. The one-line fix when it starts annoying you: at the
top of `runJob`, skip the parse step if a `parsedDocumentText` row already
exists for that document.

---

## Stage 7 — verify

- [ ] Confirm the model is pulled: `ollama list` shows
      `qwen2.5:7b-instruct-q4_K_M`. If not,
      `ollama pull qwen2.5:7b-instruct-q4_K_M`. Confirm the server answers:
      `curl http://localhost:11434/api/tags`.
- [ ] Start the API, register a fresh user, create one small schema — 4 or 5
      columns, one of each type, including one `enum`.
- [ ] Upload one clean text-layer PDF, an invoice. Not a scan: you want to test
      extraction, not OCR, on the first run.
- [ ] Watch the server log. The first call includes a 5–10 s model load.
- [ ] Extend `api/src/db/showTable.ts` to dump `extracted_values` joined to
      `schema_columns`, then run `npx tsx src/db/showTable.ts`.

**Done when**, for that one document:

- there is exactly one row per schema column;
- the `number` column has a real number in `value_number` _and_ the original
  string in `value_text`;
- the `date` column is `YYYY-MM-DD`;
- the `enum` column holds one of its `enum_options`, or null;
- a field genuinely absent from the document is null, not invented;
- `documents.status` is `extracted`.

That second-to-last bullet is the one to check against the PDF by eye. If the
model is inventing values for absent fields, that's the signal that quote
verification is worth building next — which is exactly what the empty
`resolveQuote.ts` is for.
