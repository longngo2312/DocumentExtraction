# Phase 3 — parsing → extraction → chat · Mon 10 Aug to Sun 16 Aug 2026

Goal by Sunday night: upload a document, the worker parses it, an LLM fills in the
schema's columns, and you can ask a question in English and get an answer with
citations. UI polish and deployment are next week.

One PR per day, each one independently mergeable.

## Where the code actually is today

| Piece                                                   | State                                            |
| ------------------------------------------------------- | ------------------------------------------------ |
| Auth (JWT + refresh rotation), schemas CRUD             | done                                             |
| `POST/GET/DELETE /api/documents`                        | done                                             |
| `extraction_jobs` table (admin DB)                      | exists, rows get inserted                        |
| Anything that *reads* `extraction_jobs`                 | **nothing** — every document sits at `uploaded`   |
| `extracted_values`, `document_chunks` tables            | **do not exist** in the tenant DB                 |
| Parsing, LLM, embeddings, query                         | **not started**                                   |
| `GET /api/documents/:id/file`                           | **not registered** despite commit `01290e9`       |

## Deviations from `Document Extraction Architecture Design.pdf`

These are deliberate. Update the PDF at the end of the week, not now.

1. **CDC → in-process signal + poll.** The design has workers subscribing to
   `extraction_jobs` inserts off the WAL. `better-sqlite3`'s update hook only fires
   for writes made on *that* connection — cross-process CDC needs the session
   extension, which is a day of work on its own. Option A in the PDF is an
   in-process worker anyway, so the API can just call the worker directly after
   it inserts the job, with a 5 s poll as the safety net. The `extraction_jobs`
   table stays exactly as designed, so Option B remains open later.
2. **Parsing splits into two paths**, not one bullet — see `phase3-parsing.md`.
3. **sqlite-vec → `BLOB` + cosine in JS.** FTS5 is confirmed working in the
   bundled SQLite; sqlite-vec needs a `vec0.dll` that isn't on this machine.
   A brute-force cosine over a few thousand chunks is sub-10 ms. Revisit at scale.
4. **Embeddings run locally, the LLM does not.** See the model note below.

---

## Mon 10 — Parsing layer · PR #1

Full detail in `phase3-parsing.md`. Summary: a pure library that turns a file on
disk into page-level text, with two paths — PDF/scans (text layer, OCR fallback
per page) and everything else (docx/xlsx/pptx/txt/csv). No DB, no worker, no
routes. Plus a server-side upload allowlist and a CLI smoke script.

**Done when:** `npm run parse -- <file>` prints correct text for a born-digital
PDF, a scanned PDF, a docx, an xlsx and a PNG.

## Tue 11 — Job queue + worker runtime · PR #2

The parser has nowhere to put its output yet, so this day is plumbing.

- Tenant DB: add `document_text (document_id PK, text, page_count, method,
  parsed_at)`. Keeping it in its own table rather than a column on `documents`
  means `SELECT documents.*` in the list query doesn't start dragging 200 KB of
  text per row across the wire.
- `src/features/extraction/queue/` — `claimNextJob()` (`UPDATE … SET
  status='running', attempts=attempts+1, started_at=… WHERE id=(SELECT id …
  WHERE status='queued' ORDER BY id LIMIT 1) RETURNING *`, one statement so two
  ticks can't claim the same row), `completeJob()`, `failJob()` with
  `attempts < max_attempts` → back to `queued`.
- Boot recovery: any job left `running` from a previous process is stale — reset
  it to `queued` on startup, or a crash mid-job strands the document forever.
- `src/features/extraction/worker.ts` — one job at a time, `setInterval` poll +
  an exported `notify()` the upload path calls so latency is ~0 in the happy case.
- Job runs: `documents.status='processing'` → parse → write `document_text` →
  `status='extracted'`. LLM comes tomorrow; today "extracted" just means "text".
- Failures write `extraction_jobs.error` **and** `documents.status='failed'`.

**Done when:** upload a PDF, and within a second the grid row goes
`uploaded → processing → extracted` on refresh, with text in `document_text`.

**Migration gotcha:** `openTenantDB` runs `CREATE TABLE IF NOT EXISTS` on every
open, so new *tables* land automatically on existing tenant files. New *columns*
on existing tables do not — `user_3.sqlite` and `user_5.sqlite` already exist.
Any `ALTER TABLE` needs a guarded `PRAGMA table_info` check.

## Wed 12 — LLM extraction · PR #3

The core of the product.

- Tenant DB: `extracted_values (id, document_id FK, column_id FK, value_text,
  value_number REAL, value_date, confidence REAL, source_snippet)` per the design.
- `src/features/extraction/llm/provider.ts` — a `LlmProvider` interface
  (`complete(messages, tool)`), one implementation behind it. Every later day
  imports the interface, never the vendor SDK, so swapping providers is a
  one-file change.
- Schema → tool definition: `schema_columns` rows become a JSON Schema object,
  `column.description` becomes the per-field description (that's the whole reason
  the field exists), `data_type` maps to `string`/`number`/`boolean`, `enum`
  becomes a JSON `enum`. Ask for `{ value, confidence, source_snippet }` per field.
- Validate and coerce on the way back: a `number` column must land in
  `value_number`, a `date` must normalize to `YYYY-MM-DD`, an `enum` must be one
  of `enum_options` or it becomes null. Never trust the model's typing.
- Input cap: truncate to ~40 k characters before sending. A 200-page PDF will
  otherwise blow the context window and the bill.
- Extend `GET /api/documents/:id` to return the values.

**Done when:** upload an invoice against an invoice schema and the extracted
values come back correctly typed, with confidence and a snippet per field.

## Thu 13 — Chunk, embed, index · PR #4

**This is the designated cut line.** If Wednesday slips, skip this day entirely —
Friday's chat can answer from `extracted_values` alone, which is a weaker but
fully demoable product. Losing Friday is much worse than losing Thursday.

- Tenant DB: `document_chunks (id, document_id FK, chunk_index, page, text,
  embedding BLOB)` + an FTS5 virtual table over `text`, synced with triggers.
- Chunking: ~500 tokens with ~50 overlap, split on paragraph boundaries. Carry the
  page number through from the parser so citations can say "page 4".
- Embeddings: `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` — 384
  dims, ~80 MB, CPU, no API cost, no VRAM. Load the pipeline once as a module
  singleton; re-instantiating per document will dominate your runtime.
- Store as `Buffer.from(new Float32Array(vec).buffer)`; read back with
  `new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)`.
- Worker step 4: chunk + embed after extraction.

**Done when:** a cosine search for "termination clause" returns the right chunk
from a contract you never used those exact words in.

## Fri 14 — Natural-language query · PR #5

- `POST /api/query { question, schema_id? }`.
- LLM pass 1: question + the user's schemas/columns → intent JSON
  (`{ filters: [{column, op, value}], semantic_terms: string[] }`).
- Filters → parameterised SQL over `extracted_values` typed columns. **Build the
  SQL from the parsed intent yourself — never let the model emit SQL.** The
  column whitelist comes from `schema_columns`, so an unknown column name is a
  400, not a query.
- Semantic terms → embed → cosine over chunks, in parallel with FTS5 match;
  merge with reciprocal rank fusion. Filters are hard constraints on the result set.
- LLM pass 2: answer synthesis over the top ~8 chunks, citing document id + page.
- Persist to a `queries` table so `GET /api/queries` and the audit trail exist.

**Done when:** "invoices from Acme over $10,000" returns the right documents and
a sentence citing them.

## Sat 15 — Chat + local model spike · PR #6

- Multi-turn: a `conversations` / `messages` table, prior turns fed back in so
  "what about February?" resolves against the previous question.
- Stream the answer (SSE) — the pause on a non-streamed answer feels broken.
- **Timeboxed to 3 hours, stop when the clock runs out:** install Ollama, pull
  `qwen2.5:7b-instruct-q4_K_M`, point `LlmProvider` at it, run the same five test
  documents through both and compare. If local wins on quality-per-second, keep
  it. If not, you have a measured answer instead of a guess, which is the point.

## Sun 16 — End to end, buffer, docs

- Seed script: one user, three schemas, ~10 documents through the whole pipeline.
- Walk the full flow cold: register → schema → upload → grid → ask.
- `npx tsc -b` clean in both packages.
- Update the architecture PDF with the four deviations above.
- Whatever slipped. **Something will slip — this is the day for it.**

---

## The model decision

Your card is a 6 GB RTX 3050 Laptop. Windows holds ~0.6–1 GB of that for the
desktop, so the real budget is ~5.0–5.4 GB.

| Option                       | VRAM              | Verdict                                                                                 |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Qwen2.5-7B-Instruct Q4_K_M   | ~4.7 GB + ~0.5 KV | Fits with nothing to spare. Open a browser and layers spill to CPU. ~10–20 tok/s.        |
| Qwen2.5-3B-Instruct Q4_K_M   | ~2.0 GB           | Comfortable and fast, but visibly worse at holding a 10-field JSON schema.               |
| Cloud API                    | 0                 | Best extraction quality, no VRAM ceiling, costs money.                                    |
| **all-MiniLM-L6-v2, local**  | **0 (CPU)**       | **Use this for embeddings regardless.** 80 MB, free, fast, genuinely the right call.      |

**Recommendation: cloud for extraction and query, local for embeddings.** Not
because local can't work, but because this week the visible deliverable is
extraction *quality*, and a 7B at Q4 on a laptop is where quality goes to die —
you'd spend Wednesday and Thursday debugging malformed JSON instead of building
Friday. The `LlmProvider` interface means switching costs one file, and Saturday's
spike gives you a real measurement to decide on.

Decision point: **Tuesday EOD**, so Wednesday starts with an API key in hand.

## Standing risks

- **OCR is slow.** Tesseract runs ~2–8 s/page on CPU. A 40-page scan is minutes.
  The page cap in `phase3-parsing.md` is what stops one bad upload from wedging
  the queue.
- **Tesseract downloads `eng.traineddata` (~10 MB) on first run.** Pin a
  `cachePath` inside the repo and commit it, or the first extraction on a fresh
  deploy fails on a network hiccup. This will bite next week, not this week.
- **SQLite single-writer.** One worker, one job at a time. Do not add concurrency
  to hit the deadline — `SQLITE_BUSY` under two writers will cost more than it saves.
- **The tenant DB has no migration story.** Every schema change this week is a new
  table for exactly that reason. When a column change becomes unavoidable, that's
  a real migration runner, not an afternoon.
