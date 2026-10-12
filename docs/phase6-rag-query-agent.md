# Phase 6b — RAG: chunking, embedding, ChromaDB, query agent

Build guide. Ordered stages, one checklist per file. Written 2026-09-02.

The second half of phase 6, sequenced **after**
[phase6-insight-extraction-and-summary.md](phase6-insight-extraction-and-summary.md),
whose Out of Scope explicitly defers this path. That doc makes extraction
trustworthy; this one makes the trusted output searchable and answers questions
over it.

`DocumentRecord.status` already carries `"indexed"`
([document.model.ts:13](../api/src/features/document/models/document.model.ts#L13)) —
the pipeline was designed with this terminal state in mind. Nothing reaches it
today.

Five things, in dependency order:

1. **Chunk** parsed pages into passages that keep their provenance — page, char
   offsets, span ids, boxes.
2. **Embed** chunks with a second, small Ollama model.
3. **Index** into ChromaDB, one collection per tenant, **only after human review**.
4. **Retrieve** — vector search plus a metadata filter, over reviewed documents.
5. **Answer** — a two-tool router, with citations the server verifies before they
   reach the client.

**Read [The VRAM problem](#the-vram-problem) first.** It is the constraint that
shapes every model choice here, and it is tighter than phase 6's token budget.

---

## The gate: only reviewed documents get indexed

The invariant this whole system is built around: **nothing the model produced
reaches the index until a human accepted it.** Extraction writes
`extracted_values`; a reviewer accepts, edits or rejects; only then does the
document become searchable.

| Status | Meaning | In the index? |
| --- | --- | --- |
| `extracted` | Model answered, nobody checked | **No** |
| `reviewed` | Human passed the review gate | Queued for indexing |
| `indexed` | Chunks embedded and in Chroma | Yes |

Consequences to build for, not around:

- Indexing is triggered by `saveReview`, not by the extraction worker.
- Re-review must re-index — delete this document's chunks from Chroma first, or
  a stale passage answers questions forever.
- `deleteDocument` must delete from Chroma too. SQLite has
  `ON DELETE CASCADE`; Chroma has nothing, and an orphaned vector still gets
  retrieved and still gets cited.

---

## The VRAM problem

6 GB on the 3050. Phase 6 already spends most of it:

| Resident | Size |
| --- | --- |
| `qwen2.5:7b-instruct-q4_K_M` weights | ~4.7 GB |
| KV cache at `num_ctx: 8192` | ~0.46 GB |
| **Phase 6 total** | **~5.2 GB** |

The chat path needs **both models in the same request** — embed the question,
then generate the answer. That is the moment VRAM is tightest, and if they do not
both fit, Ollama evicts and reloads on *every single chat message*: a 5–10s stall
before the answer even starts.

| Embedding model | Size | Dims | Total with qwen | Verdict |
| --- | --- | --- | --- | --- |
| `nomic-embed-text` | ~274 MB | 768 | ~5.5 GB | **Use this.** Tight, fits, good quality |
| `all-minilm` | ~46 MB | 384 | ~5.3 GB | Fallback if 5.5 GB thrashes; noticeably weaker |
| `mxbai-embed-large` | ~670 MB | 1024 | ~5.9 GB | No — over the line |

- [ ] `ollama pull nomic-embed-text`
- [ ] **Verify with `ollama ps` that both stay resident** after one chat message.
      If the chat model's `SIZE` drops or it disappears between messages, you are
      swapping — drop to `all-minilm` and re-index. This is a measurement, not a
      calculation; run it before building anything on top.
- [ ] `keep_alive: "30m"` on the embed call too, matching
      [ollama.ts:37](../api/src/features/extraction/llms/ollama.ts#L37). Default
      is 5m, which means the first query after a coffee break pays a reload.

**The dimension is permanent.** It is baked into every stored vector and into the
Chroma collection. Switching `nomic-embed-text` (768) → `all-minilm` (384)
invalidates the entire index. Decide before the first indexing run, and store the
model name on every chunk row so a mismatch is detectable rather than silently
returning garbage neighbours.

**Indexing does not have this problem.** It runs in the worker, batch, with no
chat in flight. If VRAM is the binding constraint, indexing can afford to evict
the chat model (`keep_alive: 0` on the *chat* side is not needed — just accept
the reload); interactive chat cannot.

---

## Decisions

| Question | Decision |
| --- | --- |
| Vector store | **ChromaDB**, run as a separate local server. |
| Tenancy | **One Chroma collection per user**, `user_<id>` — mirrors the tenant-DB-per-user design. |
| Source of truth | **SQLite.** Chroma holds vectors + ids + flat metadata; every chunk's text and provenance lives in `document_chunks` and can rebuild the index. |
| What gets indexed | **Reviewed documents only.** Chunks carry human-accepted context. |
| Chunk unit | **Per page**, never across a page boundary — offsets are page-local and provenance breaks otherwise. |
| Agent shape | **Fixed two-tool router**, not a free-running ReAct loop. See [Stage 7](#stage-7--the-query-agent). |
| Citations | **Server-verified.** A cited chunk id that was not in the retrieved set is dropped, not rendered. |

---

## Stage 0 — ChromaDB running

Chroma is Python. This adds a **third process** to a Node-only project — an
honest operational cost, and the main argument against it if you would rather
keep the stack homogeneous. (The alternative worth knowing: `sqlite-vec` as an
extension on the tenant DB, no new process, no new language, weaker tooling. If
the extra process is unacceptable, that swap belongs here, before Stage 1.)

- [ ] `pip install chromadb`
- [ ] `chroma run --path ./chroma-data --port 8000`
- [ ] Add `chroma-data/` to `.gitignore`.
- [ ] `npm i chromadb` in `api/`.
- [ ] **Pin the client to the server's major version.** The JS client's
      constructor and collection API changed shape across 1.x/2.x; a mismatched
      pair fails at `getOrCreateCollection` with an unhelpful error. Check the
      installed client's own README for the constructor it wants rather than
      copying one from memory.
- [ ] Confirm the server answers on `http://localhost:8000/api/v2/heartbeat`
      before writing any TypeScript against it.
- [ ] Update the "Running the Project" section of `CLAUDE.md` — it currently
      documents two terminals and this makes it three.

### New: `api/src/features/rag/vector/chroma.ts`

- [ ] Module-singleton client, same shape as `adminDB`.
- [ ] `collectionFor(userId)` → `getOrCreateCollection({ name: 'user_<id>', ... })`.
- [ ] **Set the distance metric at creation:**

```ts
metadata: { "hnsw:space": "cosine" }
```

  Chroma's default is `l2`, and **it cannot be changed after the collection
  exists** — you would have to delete and rebuild. Cosine is what normalized
  embeddings want.

- [ ] **Never let the client pick an embedding function.** The JS client will
      reach for a default (OpenAI) when you call `add` without `embeddings`,
      which means an outbound network call and an API-key error at best. Always
      pass `embeddings` explicitly; we generate them in Stage 4.
- [ ] Wrap connection failure with a named error, the way
      `describeNetworkError` does for Ollama
      ([ollama.ts:11-20](../api/src/features/extraction/llms/ollama.ts#L11-L20)) —
      "Cannot reach ChromaDB at :8000. Start it with `chroma run --path
      ./chroma-data`." A bare `fetch failed` in the document grid is the same
      unreadable failure phase 5 already fixed once.

---

## Stage 1 — Storage

### `api/src/db/tenantDb.ts`

- [ ] New table in the existing `db.exec`:

```sql
CREATE TABLE IF NOT EXISTS document_chunks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,       -- ordinal within the document, 0-based
    page          INTEGER NOT NULL,
    text          TEXT NOT NULL,
    char_start    INTEGER NOT NULL,       -- offsets into pages_json[page-1].text,
    char_end      INTEGER NOT NULL,       -- same frame as extracted_values.source_start
    span_ids      TEXT,                   -- JSON number[] — parse in consumers
    boxes         TEXT,                   -- JSON NormalizedBox[] — null for office/plain
    token_estimate INTEGER NOT NULL,
    -- Which model produced the vector. A model swap invalidates the index, and
    -- this is the only way to notice rather than silently retrieving nonsense.
    embed_model   TEXT,
    embedded_at   TEXT,
    UNIQUE(document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
```

`span_ids` / `boxes` follow the house convention (`enum_options`, `source_boxes`):
`JSON.stringify` in, raw string out of `SELECT *`, parsed at the service boundary.

**Why the offsets are page-local, not document-local:** `extracted_values`
already indexes into `pages_json[source_page-1].text`
([extractedValues.sql.ts:52-54](../api/src/features/extraction/sql/extractedValues.sql.ts#L52-L54)),
and the viewer slices from that frame. A chunk using a different frame needs its
own highlight path; using the same one means **citation highlighting is already
built** — `HighlightOverlay` and `TextViewer` take it unchanged.

### New: `api/src/features/rag/sql/chunks.sql.ts`

- [ ] `insertMany` — prepared once, run in a `db.transaction`.
- [ ] `deleteByDocument` — `DELETE FROM document_chunks WHERE document_id = ?`.
      Called before every re-index.
- [ ] `getByIds` — retrieval hydrates Chroma hits back into full rows:

```sql
SELECT c.*, d.filename
  FROM document_chunks c
  JOIN documents d ON d.id = c.document_id
 WHERE c.id IN (SELECT value FROM json_each(?));
```

  `json_each` rather than a built `IN (?,?,?)` list — the arity is the retrieval
  `nResults`, and a hand-built placeholder string is the same defect class as
  phase 6's 18-`?` upsert.
- [ ] `countByDocument` — the UI shows "indexed, 42 passages".

---

## Stage 2 — Chunking

### New: `api/src/features/rag/utils/chunker.util.ts`

```ts
export interface Chunk {
  chunkIndex: number;
  page: number;
  text: string;
  charStart: number;
  charEnd: number;
  spanIds: number[];
  boxes: NormalizedBox[];
  tokenEstimate: number;
}

export function chunkPages(
  pages: ParsedPage[],
  spansByPage: Map<number, PageSpans>,
): Chunk[];
```

- [ ] **Chunk within a page, never across one.** A chunk spanning pages has no
      single `page` and no valid offset pair, and every provenance guarantee
      phase 5 built falls over.
- [ ] Target **~1200 chars (~300 tokens), 200-char overlap.** Sizing argument:
      retrieval sends 5 chunks, `num_ctx` is 8192, so 5 × 300 = ~1500 tokens of
      context leaves room for the system prompt, the question, and a real answer.
      Bigger chunks retrieve worse *and* cost more; smaller ones lose the context
      that makes a passage answerable.
- [ ] **Snap boundaries to structure**, in preference order: paragraph break
      (`\n\n`) → sentence end → whitespace → hard cut at the limit. A chunk that
      starts mid-sentence embeds badly and reads worse when cited.
- [ ] **Derive `spanIds` and `boxes` exactly like `resolveQuote` does** — reuse
      its overlap test and `groupIntoLines`, do not re-derive them:

```ts
// Half-open ranges overlap when each starts before the other ends — the same
// test at resolveQuote.util.ts:147-149.
const covered = spans.filter((s) => s.start < charEnd && s.end > charStart);
```

  - [ ] **Export `groupIntoLines` from `resolveQuote.util.ts`** rather than
        copying it. Two implementations of line-grouping will drift, and the
        highlight will be subtly wrong in exactly one of the two places.
- [ ] Skip chunks whose text is under ~100 chars after trimming — a page footer
      embeds to noise and pollutes retrieval.
- [ ] `tokenEstimate = Math.ceil(text.length / 4)`. Crude on purpose; it exists
        to budget the prompt, not to bill anyone.

**The invariant to hold, and to test:** for every chunk,
`pages[chunk.page - 1].text.slice(chunk.charStart, chunk.charEnd) === chunk.text`.
This is the chunker's version of the span invariant documented at
[spans.util.ts:6-11](../api/src/features/parsing/utils/spans.util.ts#L6-L11). If
it does not hold, citations highlight the wrong text and nobody finds out until a
reviewer does.

---

## Stage 3 — Embedding

### `api/src/features/extraction/llms/dtos.ts`

Phase 6 Stage 2 adds `options` to `LlmRequest`. This adds a sibling capability:

```ts
export interface LlmProvider {
  name: string;
  complete(request: LlmRequest): Promise<unknown>;
  /** One vector per input, in input order. Batch — one call, not one per chunk. */
  embed(texts: string[], model?: string): Promise<number[][]>;
}
```

### `api/src/features/extraction/llms/ollama.ts`

- [ ] Implement `embed` against **`POST /api/embed`** (the batch endpoint:
      `{ model, input: string[] }` → `{ embeddings: number[][] }`). Not
      `/api/embeddings`, which is the older single-input form and would mean one
      HTTP round trip per chunk.
- [ ] `EMBED_MODEL = "nomic-embed-text"` as a module constant next to
      `OLLAMA_MODEL`.
- [ ] **Batch in groups of ~32** and check the returned array length against the
      input length on every batch. A short array silently misaligns every
      subsequent vector with its chunk — the worst failure in this stage, because
      nothing errors and retrieval just quietly returns the wrong passages.
- [ ] Reuse `describeNetworkError` — same service, same failure modes.
- [ ] The `ollama` npm package (already a dependency at `^0.6.3`) exposes
      `.embed()`. Either use it or stay on `fetch` for symmetry with `complete` —
      pick one and do not mix two HTTP styles in one file.

---

## Stage 4 — Indexing

### New: `api/src/features/rag/services/indexing.service.ts`

```ts
export async function indexDocument(
  db: Database.Database,
  userId: number,
  documentId: number,
): Promise<{ chunks: number }>;
```

Order matters — every step is written to be safe to re-run:

- [ ] Guard: read the document, **return early unless `status === 'reviewed'`**.
      The gate is enforced here, in one place, not at each call site.
- [ ] Read `parsedDocumentText` via `DOCUMENT_TEXT_SQL.getByDocumentId` (the
      `SELECT *` one — this path needs `spans_json`).
- [ ] **Delete first, both sides:** `deleteByDocument` in SQLite, and
      `collection.delete({ where: { document_id: documentId } })` in Chroma.
      Re-indexing without this leaves the old chunks retrievable forever.
- [ ] `chunkPages(...)` → insert rows in one transaction → **read the assigned
      `id`s back**. The Chroma id must be the SQLite row id (as a string); a
      separately-generated uuid means a second mapping table for nothing.
- [ ] `embed()` the chunk texts in batches.
- [ ] `collection.add({ ids, embeddings, documents, metadatas })`.
- [ ] **Chroma metadata takes flat scalars only — string, number, boolean. No
      arrays, no nested objects.** `span_ids` and `boxes` therefore *cannot* live
      there; they stay in SQLite and are joined back at retrieval by chunk id.
      Metadata carries only what a `where` filter needs:

```ts
{ document_id, schema_id, page, filename }
```

- [ ] Stamp `embed_model` and `embedded_at` on the rows.
- [ ] Flip the document to `'indexed'`.
- [ ] Wrap the Chroma write so a failure leaves the document at `'reviewed'` —
      **not** `'indexed'`. A document marked indexed with nothing in the vector
      store is invisible to search and looks fine in the grid, which is the worst
      combination available.

### Job wiring

`extraction_jobs` has no `job_type`
([adminDB.ts:24-36](../api/src/db/adminDB.ts#L24-L36)), and phase 6 deferred
adding one. Indexing needs it.

- [ ] Add to `extraction_jobs`:

```sql
job_type TEXT NOT NULL DEFAULT 'extract'
         CHECK(job_type IN ('extract','index')),
```

  The `DEFAULT 'extract'` is what keeps this cheap — existing rows and existing
  inserts stay correct without being touched. You are wiping `admin.sqlite` in
  phase 6 Stage 0 anyway, so do this in the same reset.
- [ ] `QUEUE_SQLS.claimJob` — return `job_type` (`SELECT *` already would; check
      whether it names columns).
- [ ] `worker.ts` `runJob` — branch on `job.job_type` at the top. The index branch
      skips parsing and extraction entirely; it is a different pipeline that
      happens to share a queue.
- [ ] `saveReview` in `review.service.ts` — enqueue an `index` job after the
      transaction commits, then `notifyWorker()`. **After**, not inside: an
      enqueue inside the transaction can be rolled back while the worker has
      already claimed it.

**Why a job and not a synchronous call in the request:** embedding 40 chunks on
this GPU is ~3–8s, plus a possible model reload. That is too long for a click
handler, and the queue already exists.

---

## Stage 5 — Retrieval

### New: `api/src/features/rag/services/retrieval.service.ts`

```ts
export interface RetrievedChunk {
  id: number;
  documentId: number;
  filename: string;
  page: number;
  text: string;
  charStart: number;
  charEnd: number;
  spanIds: number[];
  boxes: NormalizedBox[] | null;
  distance: number;
}

export async function retrieve(
  db: Database.Database,
  userId: number,
  question: string,
  filter?: { documentId?: number; schemaId?: number },
  k = 5,
): Promise<RetrievedChunk[]>;
```

- [ ] Embed the question with **the same model** used for indexing. Cross-model
      vectors are not comparable, and nothing about the result will look wrong —
      it will just be subtly useless.
- [ ] `collection.query({ queryEmbeddings, nResults: k, where })`.
- [ ] Hydrate hits through `CHUNKS_SQL.getByIds` and **re-sort into Chroma's
      distance order** — SQLite returns rows in its own order and losing the
      ranking silently degrades every answer.
- [ ] **Drop hits above a cosine-distance floor** (start at ~0.6, tune by
      watching real queries). Retrieval always returns `k` results, including for
      a question the corpus cannot answer at all. Without a floor the model gets
      five irrelevant passages and dutifully writes an answer from them — the RAG
      equivalent of phase 6's unsupported inference.
- [ ] A chunk whose row is missing from SQLite is a **stale Chroma entry**. Skip
      it and log — it means a delete path failed somewhere, and it will keep
      happening until that is fixed.

---

## Stage 6 — Prompting the answer

### New: `api/src/features/rag/services/answer.service.ts`

- [ ] Context block. Number the passages **positionally, 1..N**, and map back to
      chunk ids in TS — the same rule as phase 6's grounding claims, for the same
      reason: a 7B copying database ids back is a needless error surface.

```
[1] (Ruiz-CV.pdf, page 2)
Led the payments team from 2021, growing it from three to nine engineers.

[2] (Ruiz-CV.pdf, page 1)
Senior Software Engineer, Acme Corp, 2021-2026.
```

- [ ] System prompt:

```
You answer questions using only the passages provided.

Each passage is numbered. Every claim in your answer must come from a passage,
and every sentence that makes a claim must cite the passage it came from as [1]
or [2, 3].

If the passages do not contain the answer, say so plainly: "The documents I have
access to do not cover this." Do not fill the gap from your own knowledge, and
do not answer from the filenames or page numbers alone.

If the passages disagree with each other, say that they disagree and cite both.

Do not cite a number that is not in the list above. Do not describe the passages
as documents you were "given" — just answer the question.
```

  Same principle as the extraction quote rule, one level up: **an answer that
  cites nothing cannot be checked.** "The documents do not cover this" is the
  RAG equivalent of `basis: "absent"` — a real, correct, available answer.

- [ ] `options: { temperature: 0.2, num_predict: 800 }`. Not 0 — the same
      flatness argument as phase 6's summary call.
- [ ] **Verify citations server-side before returning.** Parse `[n]` out of the
      answer, map to chunk ids, and **drop any number outside the retrieved
      set.** The model will occasionally cite `[7]` when it was given five
      passages. Rendering that as a link produces a citation that goes nowhere,
      which is worse than no citation because it looks checked.
- [ ] Return the answer, the *cited* chunks (not all retrieved ones), and the
      retrieval distances — the UI needs the first two and the debugging needs
      the third.

---

## Stage 7 — The query agent

The user asked for an agent. Be deliberate about how much agency a 7B at 8192
context can carry.

**Two tools are genuinely useful here:**

| Tool | Answers | Backed by |
| --- | --- | --- |
| `search_passages` | "What did the contract say about termination?" | Stage 5 vector search |
| `query_values` | "How many candidates have a security clearance?" | SQL over `extracted_values` |

The second matters more than it looks. Aggregate questions — counts, filters,
comparisons across documents — are exactly what vector search is worst at and
what the reviewed `extracted_values` table answers exactly. The schema is known,
the values are human-accepted, and the answer is a `SELECT`.

- [ ] **Build a fixed router, not a ReAct loop.** One cheap classification call
      picks the tool, the tool runs, one answer call writes the response. Two LLM
      calls, bounded, ~25s.

```ts
const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    tool: { enum: ["search_passages", "query_values", "both"] },
    document_filter: { type: ["integer", "null"] },
  },
  required: ["tool", "document_filter"],
  additionalProperties: false,
};
```

  **Why not a real agent loop:** a free-running loop on a 7B needs reliable
  multi-turn tool calling, a growing transcript inside an 8192 window, and a
  termination condition the model respects. Each iteration is another ~20s on
  this GPU, and the common failure is looping until the context fills. The router
  gets ~90% of the value at a fraction of the fragility. Revisit if and when the
  judge model moves to a hosted API — the interface below is what makes that a
  one-file change.

- [ ] `query_values` **must not take model-written SQL.** Give it a fixed,
      parameterised query surface — column, operator, value — and build the SQL in
      TS. A model emitting raw SQL against the tenant DB is an injection hole
      wearing a helpful face, and constrained decoding is not a security boundary.
- [ ] `query_values` reads **only** rows where `review_status IN ('accepted',
      'edited')`. A rejected value is one a human said was wrong; counting it is
      worse than omitting it.
- [ ] Cite `query_values` results too — by document filename and column name, so
      "4 candidates" stays checkable against the four rows it came from.
- [ ] **Conversation history: send at most the last 2 turns**, and never the old
      retrieved passages. The window is 8192 and the passages are the expensive
      part; a chat that quietly stops answering after six turns is context
      exhaustion, not a bug in the prompt.

---

## Stage 8 — API

### New: `api/src/features/rag/controllers/query.controller.ts` and `api/src/routes/query.ts`

- [ ] `POST /api/query` — `{ question, history?, documentId? }` → answer +
      citations. Mounted behind `requireAuth` like every other route.
- [ ] `GET /api/query/status` → indexed document count, chunk count, and whether
      Chroma is reachable. The empty state needs to distinguish "you have not
      reviewed anything yet" from "the vector database is not running", and only
      the server can tell them apart.
- [ ] `POST /api/documents/:id/index` — manual re-index. Useful while tuning
      chunk size, since every change invalidates the whole index.
- [ ] `deleteDocument` — **add the Chroma delete.** SQLite cascades,
      Chroma does not.

**Streaming.** `OllamaProvider.complete` is non-streaming and JSON-only. A
25-second wait with no output is the difference between "thinking" and "broken".
Either:

- **Ship non-streaming first** with an honest progress indicator, or
- Add `stream: true` to `LlmRequest` and an SSE route.

Non-streaming first is the right call — it keeps this phase's surface small, and
the tool-routing call has to complete before any answer token exists anyway.
Note it as the first follow-up, because it is the single largest perceived-quality
win available here.

---

## Stage 9 — Frontend

[QueryPage.tsx](../frontend/src/pages/QueryPage.tsx) is a one-line stub, and
`/query` is already routed
([AppRouter.tsx:36](../frontend/src/router/AppRouter.tsx#L36)). Per CLAUDE.md,
build components, not one long page.

### `frontend/src/api/query.ts`

- [ ] `askQuestion`, `getQueryStatus`, `reindexDocument` via `apiFetch`.

### `frontend/src/pages/QueryPage.tsx`

- [ ] Owns message state and data fetching only; rendering lives in components.
- [ ] Local `useState` for the transcript. Not `zustand` — the transcript is not
      shared with any other page, and `schemaStore` exists because the schema list
      *is*.

### New components — `frontend/src/components/query/`

- [ ] `ChatTranscript.tsx` — the scrollback, auto-scrolled to the newest message.
- [ ] `ChatMessage.tsx` — one bubble, user or assistant.
- [ ] `ChatComposer.tsx` — textarea, Enter to send, Shift+Enter for a newline,
      disabled while a request is in flight.
- [ ] `CitationChip.tsx` — inline `[1]`. Renders as `filename p.2`, and clicking
      it navigates to `/documents/:id` with the chunk's `page`, `char_start`,
      `char_end` and `boxes`.
- [ ] `SourcesList.tsx` — the cited passages under an answer, collapsed by
      default. The passage text must be visible **without leaving the page**;
      an answer whose evidence costs a navigation to check is an answer nobody
      checks.
- [ ] `QueryEmptyState.tsx` — three real states, the same discipline as phase 6's
      `SummaryTab`:
      - Chroma unreachable → "The vector database is not running."
      - Reachable, zero indexed documents → **"Review a document to make it
        searchable"**, with a link to `/documents`. This is the gate becoming
        visible, and it is the state a new user hits first.
      - Ready → suggested questions.

### Citation → highlight

- [ ] `ExtractedDocumentPage` should accept a highlight target from navigation
      state, not just from a selected field. The chunk carries `page`,
      `char_start`, `char_end` and `boxes` in the **same frame** as
      `ReviewField.source_*`, so `HighlightOverlay` and `TextViewer` take it
      unchanged. This is the payoff for chunking with provenance in Stage 2 —
      done right, citation highlighting is a routing change and no new viewer code.

### `DocumentStatusChip.tsx`

- [ ] Add the `indexed` state. It exists in the type union today and has never
      been rendered.

---

## Verification

- [ ] **The chunk invariant.** For every chunk,
      `pages[page-1].text.slice(char_start, char_end) === text`. Script it over
      one PDF and one docx; if it fails, stop — every citation below is wrong.
- [ ] **Vector/chunk alignment.** Index a document, then embed one chunk's text
      by hand and query with it. The top hit must be that chunk. If it is a
      different one, the Stage 3 batch loop is misaligned.
- [ ] **The gate holds.** Upload and extract a document but do not review it. It
      must not appear in any answer. Then review it and confirm it does.
- [ ] **Re-index is idempotent.** Review the same document twice.
      `countByDocument` must not double, and Chroma must not hold two copies of
      each passage.
- [ ] **Delete is complete.** Delete an indexed document, then ask a question it
      previously answered. No stale citation, no crash on a missing SQLite row.
- [ ] **The refusal works.** Ask something the corpus has no answer to. It must
      say so rather than assembling an answer from the five nearest passages —
      this is the distance floor and the prompt working together, and it is the
      RAG equivalent of the staff-engineer test.
- [ ] **Citations resolve.** Every `[n]` in an answer maps to a real chunk, and
      clicking it lands on the right page with the right text highlighted.
- [ ] **Invented citations are dropped.** Hand-feed the answer service a response
      containing `[9]` when 5 passages were retrieved. It must not reach the
      client.
- [ ] **VRAM.** `ollama ps` after three consecutive chat messages. Both models
      resident, no reload between messages. This is the assumption the whole model
      choice rests on — measure it, do not trust the arithmetic above.
- [ ] **Cross-document.** Two documents on the same schema. A question only the
      second answers must retrieve from the second.
- [ ] **Aggregate path.** "How many documents have X?" must route to
      `query_values`, not `search_passages`. If the router always picks search,
      the second tool is decoration.

---

## Standing risks

- **Retrieval quality on a small corpus is the whole ballgame.** With a handful
  of documents, top-5 cosine over 300-token chunks is adequate. It degrades
  first, and before reranking or hybrid search, the cheap wins are chunk size and
  the distance floor.
- **`nomic-embed-text` is English-first.** Non-English documents will retrieve
  noticeably worse, and nothing in the UI will say why.
- **The 8192 window caps everything.** 5 passages plus history plus system prompt
  plus answer. More chunks means shorter ones or less history; there is no third
  option on this card.
- **Chroma is a third process with no supervision.** If it dies, indexing fails
  and querying fails, and the only signal is the error text you wrote in Stage 0.
  Make that text good.
- **Re-review invalidates the index and nothing enforces it.** The `saveReview`
  hook is the only thing keeping chunks in sync with accepted values. If a future
  path writes `extracted_values` without going through it, the index silently
  drifts.
- **The router is a fixed policy, not an agent.** It cannot decompose a question,
  and "compare the termination clauses in these three contracts" will retrieve
  five passages from whichever contract embeds closest. That limit is the price
  of not running a loop on a 7B, and it is the right trade today.

## Out of scope

- Streaming responses (first follow-up).
- Reranking, hybrid BM25 + vector, query expansion.
- A real multi-step agent loop.
- Cross-tenant or shared collections.
- Chroma persistence tuning, backup, or migration.
- Summarising across documents — phase 6's summary is per-document.
