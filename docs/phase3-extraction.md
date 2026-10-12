# Phase 3 — extraction · PR #2 (queue + worker) and PR #3 (LLM extraction)

Per-file build guide for the two PRs that turn a parsed file into typed column
values. Supersedes the Tue 11 / Wed 12 sections of `phase3-week-plan.md`.

## Decisions made 2026-08-12

1. **Local Ollama (`qwen2.5:7b-instruct-q4_K_M`) for extraction**, not a cloud API.
   Chosen over the week plan's recommendation — noted so the trade-off is on the
   record, not to relitigate it. Everything sits behind an `LlmProvider`
   interface, so Saturday's spike can swap the implementation in one file.
2. **Two PRs, back to back.** PR #2 is independently mergeable and demoable on
   its own (grid goes `uploaded → processing → extracted` with real text in the
   DB). PR #3 lands on top.

### The context-window consequence of going local

The week plan says "truncate to ~40 k characters before sending." That assumed a
cloud context window. It does not survive the move to local:

|                        |                                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| Card                   | RTX 3050 Laptop, 6 GB — real budget ~5.0–5.4 GB after the Windows desktop |
| Weights, 7B q4_K_M     | ~4.7 GB                                                                   |
| KV cache               | ~56 KB/token (28 layers × 4 KV heads × 128 dim × 2 × 2 bytes)             |
| KV at `num_ctx: 8192`  | ~0.46 GB → **~5.2 GB total, fits**                                        |
| KV at `num_ctx: 16384` | ~0.92 GB → ~5.6 GB, **spills to CPU**                                     |

So `num_ctx: 8192`. Reserve ~1 000 tokens for the answer and ~500 for the
instructions, leaving ~6 500 tokens of document text ≈ **15 000–18 000
characters**. Use `MAX_INPUT_CHARS = 16000`. A document longer than that gets
head-truncated for now; per-page or per-field targeting is a Thursday problem.

**Ollama's default `num_ctx` is 2048.** If you don't set it explicitly your
prompt is silently truncated to 2 k tokens and the model extracts from the first
page only. This is the single most likely cause of "it returns nulls for
everything" — check it first.

---

## PR #2 — job queue + worker runtime

No LLM, no new dependencies. Goal: a job inserted at upload gets picked up
within a second, the file is parsed, the text lands in the tenant DB, and the
document's status reflects reality.

### 1. `api/src/db/tenantDb.ts` — add `document_text`

Append to the existing `db.exec()` block. It runs on every `openTenantDB`, so
new _tables_ land automatically on `user_3.sqlite` and `user_5.sqlite`. (New
_columns_ on existing tables would not — that would need a guarded
`PRAGMA table_info` check. Avoid needing one.)

```sql
CREATE TABLE IF NOT EXISTS document_text (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    text        TEXT    NOT NULL,
    pages_json  TEXT    NOT NULL,
    page_count  INTEGER NOT NULL,
    char_count  INTEGER NOT NULL,
    method      TEXT    NOT NULL,
    parsed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Two notes:

- Its own table rather than a column on `documents`, so `SELECT documents.*` in
  the list query doesn't start dragging 200 KB of text per row across the wire.
- `pages_json` is `JSON.stringify(result.pages)` — same raw-string convention as
  `schema_columns.enum_options`, so it must be parsed in consumers. It costs
  nothing today and it's what lets Thursday's citations say "page 4." Drop the
  page array now and Thursday has to re-parse every document to get it back.

### 2. `api/src/features/extraction/models/extraction.model.ts`

```ts
export interface DocumentText {
  document_id: number;
  text: string;
  pages_json: string; // JSON.stringify(ParsedPage[]) — parse before use
  page_count: number;
  char_count: number;
  method: string;
  parsed_at: string;
}
```

Import `ExtractionJob` from `../../document/models/document.model.js` rather
than redefining it — it's already correct there, and moving it mid-week creates
churn in files this PR otherwise doesn't touch.

### 3. `api/src/features/extraction/sqls/job.sql.ts` — admin DB

```ts
export const QUEUE_SQL = {
  // One statement, so two ticks can never claim the same row. SQLite's
  // RETURNING needs .get(), not .run().
  claimNext: `
    UPDATE extraction_jobs
       SET status = 'running',
           attempts = attempts + 1,
           started_at = datetime('now')
     WHERE id = (
       SELECT id FROM extraction_jobs
        WHERE status = 'queued'
        ORDER BY id
        LIMIT 1
     )
    RETURNING *;
  `,

  complete: `
    UPDATE extraction_jobs
       SET status = 'done', error = NULL, finished_at = datetime('now')
     WHERE id = ?;
  `,

  // Retry until attempts runs out. `permanent` (0/1) is bound twice so an
  // unsupported file type fails on the first try instead of three times.
  fail: `
    UPDATE extraction_jobs
       SET status = CASE WHEN ? = 0 AND attempts < max_attempts
                         THEN 'queued' ELSE 'failed' END,
           error = ?,
           finished_at = CASE WHEN ? = 0 AND attempts < max_attempts
                              THEN NULL ELSE datetime('now') END
     WHERE id = ?
    RETURNING status;
  `,

  // Boot recovery: anything left 'running' is from a process that died.
  resetStale: `
    UPDATE extraction_jobs SET status = 'queued', started_at = NULL
     WHERE status = 'running';
  `,
};
```

### 4. `api/src/features/extraction/sqls/documentText.sql.ts` — tenant DB

`upsert` (so a retry after a partial failure doesn't hit a PK conflict), and
`getByDocumentId`.

```ts
upsert: `
  INSERT INTO document_text
    (document_id, text, pages_json, page_count, char_count, method, parsed_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(document_id) DO UPDATE SET
    text = excluded.text,
    pages_json = excluded.pages_json,
    page_count = excluded.page_count,
    char_count = excluded.char_count,
    method = excluded.method,
    parsed_at = excluded.parsed_at;
`,
```

### 5. `api/src/features/document/sqls/document.sql.ts` — one addition

```ts
updateStatus: `UPDATE documents SET status = ? WHERE id = ?;`,
```

### 6. `api/src/features/extraction/queue/jobQueue.ts`

Thin wrappers over the SQL above, all against `adminDB`:

- `claimNextJob(): ExtractionJob | undefined` — `.get()`, not `.run()`.
- `completeJob(jobId: number): void`
- `failJob(jobId, message, permanent = false): "queued" | "failed"` — return the
  resulting status so the worker knows whether to also mark the _document_
  failed. A job going back to `queued` should leave the document at `processing`.
- `recoverStaleJobs(): number` — returns the count so boot can log it.

Truncate `message` to ~500 chars before storing. A stack trace from `pdf-parse`
in the `error` column is unpleasant to read in a grid cell.

### 7. `api/src/features/extraction/worker.ts` — the core

Single concurrency guard, polling interval, and an exported `notify()` so the
upload path gets ~0 latency in the happy case:

```ts
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return; // one job at a time — SQLite is single-writer
  ticking = true;
  try {
    let job = claimNextJob();
    while (job) {
      await runJob(job);
      job = claimNextJob();
    }
  } finally {
    ticking = false;
  }
}

/** Called by the upload path so a fresh job starts immediately. */
export function notifyWorker(): void {
  void tick();
}

export function startWorker(): void {
  const recovered = recoverStaleJobs();
  if (recovered > 0) console.log(`[worker] requeued ${recovered} stale job(s)`);
  setInterval(() => void tick(), 5000); // safety net
}
```

`runJob(job)` in order:

1. `const db = getTenantDb(job.user_id)`
2. Read the document by `job.document_id`. **If it's missing, `completeJob()` and
   return** — a deleted document is not a failure, and `deleteDocument` already
   removes its jobs. Treating it as a failure means a deleted-mid-parse document
   burns all three attempts and logs a scary error.
3. `documents.status = 'processing'`
4. `extractText(resolveStoragePath(document.storage_path), document.mime_type)`
   — `resolveStoragePath` comes from `features/document/utils/storage.util.ts`;
   note it resolves under `api/storage/uploads`, **not** the unused
   `tenantUploadDir` in `tenantDb.ts` (that helper points at a directory nothing
   writes to — worth deleting in a cleanup commit, not this one).
5. Upsert `document_text`.
6. `documents.status = 'extracted'`, then `completeJob()`.
7. `catch`: `const permanent = error instanceof ParsingError && (error.code === "unsupported" || error.code === "encrypted")`. Call
   `failJob(job.id, message, permanent)`; only if it returns `"failed"` set
   `documents.status = 'failed'`. Retryable failures leave the row at
   `processing` so the UI doesn't flicker `failed → processing → extracted`.

Also register `shutdownOcr()` (exported from `features/parsing`) on `SIGINT` /
`SIGTERM`. Tesseract spawns worker processes; without this, `tsx watch` leaks one
per restart and you'll be wondering where your RAM went by Friday.

### 8. `api/src/features/document/services/documents.services.ts`

After the `JOB_SQL.insertJob` succeeds, call `notifyWorker()`. Put it _after_ the
try/catch that rolls back the document row on insert failure — you don't want to
wake the worker for a job that got rolled back.

### 9. `api/src/server.ts`

`startWorker()` before `app.listen`. Boot recovery must run before the first
request can enqueue anything new.

### Done when

Upload a PDF and, within a second, the grid row goes `uploaded → processing →
extracted` on refresh, with real text in `document_text`. Then: kill the server
mid-parse of a big scan, restart, and confirm the job is requeued and completes
rather than stranding the document at `processing` forever.

Also worth adding while you're here — the week plan's Monday deliverable claimed
`npm run parse -- <file>` but `api/package.json` has no `parse` script. Add
`"parse": "tsx src/features/parsing/cli.ts"` (or whatever you named the smoke
script) so the claim is true.

---

## PR #3 — extraction with a local model

### 10. `api/src/db/tenantDb.ts` — add `extracted_values`

```sql
CREATE TABLE IF NOT EXISTS extracted_values (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES schema_columns(id) ON DELETE CASCADE,
    value_text     TEXT,
    value_number   REAL,
    value_date     TEXT,
    confidence     REAL,
    source_snippet TEXT,
    UNIQUE(document_id, column_id)
);
CREATE INDEX IF NOT EXISTS idx_values_document ON extracted_values(document_id);
```

`UNIQUE(document_id, column_id)` makes re-extraction an upsert instead of a
duplicate-row bug.

### 11. `api/src/features/extraction/llm/provider.ts` — the seam

The whole point of this file is that **nothing else in the codebase imports an
Ollama type.** Days 4–6 import this interface only.

```ts
export interface LlmRequest {
  system: string;
  prompt: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
}

export interface LlmProvider {
  name: string;
  complete(request: LlmRequest): Promise<unknown>; // parsed JSON
}
```

### 12. `api/src/features/extraction/llm/ollama.provider.ts`

`POST http://localhost:11434/api/chat`, no SDK needed — Node 22's global `fetch`
is enough.

```ts
const body = {
  model: OLLAMA_MODEL, // "qwen2.5:7b-instruct-q4_K_M"
  messages: [
    { role: "system", content: request.system },
    { role: "user", content: request.prompt },
  ],
  format: request.schema, // grammar-constrained decoding
  stream: false,
  keep_alive: "30m",
  options: {
    temperature: 0,
    num_ctx: 8192,
    num_predict: 1024,
  },
};
```

Response shape is `{ message: { content: string }, ... }`; `JSON.parse` the
content and return it.

Four things that will bite you:

- **`format` constrains the output but is never shown to the model.** Ollama
  compiles the schema to a GBNF grammar at the decoder. The model itself sees
  only your messages. If you rely on JSON Schema `description` fields to convey
  what each column means, the model never reads them — you must also list the
  fields and their descriptions in the prompt text. This is the difference
  between well-formed JSON full of nulls and well-formed JSON with right answers.
- **`num_ctx` defaults to 2048.** Set it. See the table at the top.
- **`keep_alive`** — the default unloads the model after 5 minutes, and a cold
  load is 5–10 s. Over a 10-document batch with gaps, that dominates runtime.
- Timeout the fetch (`AbortSignal.timeout(120_000)`). A wedged generation will
  otherwise hold the worker's single slot indefinitely and nothing else extracts.

Fail with a typed error so `failJob` can decide: a connection refused (Ollama
not running) is retryable; a 404 for an unpulled model is permanent.

### 13. `api/src/features/extraction/schemaToJsonSchema.ts`

`SchemaColumns[]` → `{ schema, keyToColumnId, fieldLines }`.

Key decisions, all of which exist because this is a 7B at q4 and not a frontier
model:

- **Every property is `{ "type": ["string", "null"] }`.** Do not ask the grammar
  for `number`. A 7B constrained to emit a JSON number on `$1,234.56` will emit
  something, and what it emits is not reliably 1234.56. Take the raw string and
  parse it yourself in step 14, where you can see and test the parsing.
- **`enum` columns get a real `enum`** (the parsed `enum_options` array plus
  `null`). This is the one place the grammar genuinely does the work for you —
  the model _cannot_ return an out-of-set value. Free correctness; use it.
- **Keys are slugified column names, not raw names and not IDs.** `Invoice #` →
  `invoice_number`-style slug, deduped with a numeric suffix on collision. Raw
  names break on spaces and punctuation; opaque `col_17` keys throw away the
  semantic signal that is doing most of the work at this model size. Return
  `keyToColumnId: Map<string, number>` so step 16 can map results back.
- `required: [...all keys]` and `additionalProperties: false`, so the grammar
  forces every field to be present and invents no extras. Missing becomes an
  explicit `null` rather than an absent key.
- **`fieldLines`** is the human-readable field list for the prompt —
  `- invoice_number (text): The invoice's unique identifier` — because of the
  first bullet in §12.

### 14. `api/src/features/extraction/coerce.ts`

Per `data_type`, take the model's raw string and produce the DB row. Never trust
the model's typing:

| `data_type` | Lands in                          | Rules                                                                                                                                                                                                                              |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`      | `value_text`                      | trim; empty → null                                                                                                                                                                                                                 |
| `number`    | `value_number`                    | strip currency symbols, thousands separators, whitespace; `Number()`; `NaN` → null. Keep the original string in `value_text` too — it's what the UI should display                                                                 |
| `date`      | `value_date`                      | normalize to `YYYY-MM-DD`; anything unparseable → null. Do **not** hand ambiguous strings to `new Date()` — `03/04/2026` is March 4th or April 3rd depending on nothing you can see. Match explicit patterns and give up otherwise |
| `boolean`   | `value_text` (`"true"`/`"false"`) | accept yes/no/true/false/1/0 case-insensitively; anything else → null                                                                                                                                                              |
| `enum`      | `value_text`                      | must be in `enum_options` or null — belt and braces, even though the grammar already enforced it                                                                                                                                   |

Every coercion failure is a `null`, never a throw. One bad field must not sink
the other nine.

### 15. `api/src/features/extraction/evidence.ts`

This is where local diverges most from the week plan. **Don't ask a 7B for
`confidence` and `source_snippet`.** Its self-reported confidence is noise, and
asking it for a verbatim quote invites it to invent one. Derive both:

- `source_snippet`: case-insensitive search for the returned value in
  `document_text.text`; on a hit, return ±120 characters around it.
- `confidence`: `0.9` if the value appears verbatim, `0.6` on a normalized match
  (whitespace/case/punctuation folded), `0.3` if it doesn't appear at all.

The last case is the useful one — a value the model produced that is nowhere in
the document is very likely a hallucination, and this surfaces it for free. The
DB columns stay exactly as designed, so swapping in a cloud model on Saturday
just means filling them from the response instead of from this file.

### 16. `api/src/features/extraction/extractionService.ts`

`extractDocument(userId, documentId)`:

1. Load the document, its schema's columns (`getColumnsBySchemaIdOrdered`), and
   its `document_text`. **Remember `enum_options` comes back as a raw JSON
   string and must be parsed.**
2. No columns → no-op success.
3. `buildSchema(columns)` → schema, key map, field lines.
4. Truncate text to `MAX_INPUT_CHARS` (16000).
5. `provider.complete({ system, prompt, schema })`.
6. For each key: coerce (§14), derive evidence (§15), upsert into
   `extracted_values`.

Prompt shape — keep it boring, a 7B rewards boring:

```
system: You extract structured data from documents. Use only information
present in the document. If a field is not stated in the document, return null
for it. Do not guess.

user:  Fields to extract:
       - invoice_number (text): The invoice's unique identifier
       - total_amount (number): Grand total including tax
       - status (enum: paid, unpaid): Payment status

       Document:
       """
       <truncated text>
       """
```

If a schema has more than ~10 columns and quality is visibly bad, batch the
columns into groups of ~8 and make several calls. Don't build this on day one —
build it when you've seen it fail, because it triples your latency.

### 17. `api/src/features/extraction/worker.ts` — step 4

After `document_text` is written and before `status = 'extracted'`, call
`extractDocument`. A parse that succeeds and an extraction that fails should
still leave the text in the DB — so either let the extraction failure fail the
whole job (simple, and the parse is cheap to redo from cache) or add an
`extracted` vs `text_only` distinction. **Take the simple option this week.**

### 18. `GET /api/documents/:id` returns the values

Extend `getDocById` to also select `extracted_values` joined to `schema_columns`
(for `name` and `data_type`), and return them as a `values` array on the detail
response. Keep the list endpoint untouched — the whole reason `document_text` is
its own table is to keep the list query lean.

### Done when

Upload an invoice against an invoice schema and `GET /api/documents/:id` returns
correctly typed values with a confidence and a snippet per field. Specifically
check: a `number` column comes back in `value_number` as a real number, a `date`
is `YYYY-MM-DD`, an `enum` is one of `enum_options`, and a field genuinely absent
from the document is `null` rather than invented.

---

## Standing risks, updated

- **The 16 k character cap is a real ceiling.** A 40-page contract gets its first
  ~6 pages read and nothing else. Fine for invoices and forms, wrong for
  contracts. Thursday's chunking is what actually fixes this; until then, don't
  demo on a long document.
- **First `ollama pull` is ~4.7 GB.** Do it before Wednesday's build session, not
  during it.
- **Close your browser during extraction.** At ~5.2 GB of a ~5.4 GB budget, a
  handful of Chrome tabs is enough to push layers onto the CPU and turn a 20 s
  extraction into three minutes. If you see that, it's not the code.
- **SQLite single-writer.** One worker, one job at a time, enforced by the
  `ticking` flag. Do not add concurrency to hit the deadline — `SQLITE_BUSY`
  under two writers will cost more than it saves.
- **Tenant DB still has no migration story.** Every schema change here is a new
  table for exactly that reason.
