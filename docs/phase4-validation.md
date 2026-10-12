# Phase 4 — validation · PR #4 (grounded extraction) and PR #5 (review UI)

Per-file build guide for the human-review layer that sits between extraction and
chunking/embedding. Nothing gets indexed until a person has confirmed it.

## Decisions made 2026-08-20

1. **Left panel renders the original PDF** via `react-pdf` with a highlight
   overlay on the text layer — not a plain-text view of `pages_json`.
2. **Provenance is a model-supplied quote, verified server-side.** The LLM
   returns a verbatim `quote` + `page` per field; the server searches for that
   quote in the parsed page text and computes the offsets itself. The model is
   never trusted for a character position.
3. **Scope is extraction + validation**, because the quote contract lives in the
   extraction JSON schema. Splitting them means writing the extract step twice.

### This supersedes §15 of `phase3-extraction.md`

That section said: *"Don't ask a 7B for `source_snippet` — asking it for a
verbatim quote invites it to invent one."* That reasoning held when the quote
was going to be **displayed as reassurance**. It inverts once the quote is
**verified**: a quote the model invented is one that `indexOf` cannot find, and
a quote that cannot be found is the single highest-signal hallucination detector
in this whole design. Asking for a quote and checking it beats deriving a
snippet by searching for the value, because a hallucinated *value* can still
coincidentally appear somewhere in a long document, whereas a hallucinated
*sentence* essentially never does.

Keep §15's `confidence` advice though: still don't ask the model to rate itself.
Confidence is derived from the match, in §7 below.

---

## The seam you must not get wrong

There are two different strings that both look like "the text of page 3":

| |Produced by|Used for|
|---|---|---|
|`pages_json[2].text`|`pdf-parse` → `normalizeWhiteSpace()` on the server|Verifying the quote exists; the context snippet|
|PDF.js text layer|`page.getTextContent()` in the browser|Drawing the highlight rect|

They do not agree on whitespace. `normalizeWhiteSpace` strips trailing spaces
and collapses newline runs ([text.util.ts:1-14](../api/src/features/parsing/utils/text.util.ts#L1-L14));
PDF.js emits positioned text items with no reliable inter-item spacing at all.
An offset into one is meaningless in the other.

**Therefore:** the API sends the client the `quote` *string* and a page number,
not `start`/`end`. The client runs its own search. The stored offsets exist so
you can render a context snippet server-side and so you can debug later — they
never travel to the highlight code.

The one consequence to internalize: **both sides must normalize identically, and
the normalization is "delete all whitespace," not "collapse runs to one space."**
Collapsing fails on `ACME SUPPLY` vs `ACMESUPPLY`. Deleting succeeds on both.

---

# PR #4 — grounded extraction

## 1. Face the migration problem first

`openTenantDB` only runs `CREATE TABLE IF NOT EXISTS`
([tenantDb.ts:14-74](../api/src/db/tenantDb.ts#L14-L74)). New *tables* land on
existing tenant DBs automatically. New *columns* and changed *CHECK constraints*
do not, silently. This phase needs both.

Do this once, at the top of the file, before the `db.exec()`:

```ts
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((c) => c.name === column);
}
```

Then after the `db.exec()`, guarded additive migrations:

```ts
if (!hasColumn(db, "documents", "reviewed_at")) {
  db.exec(`ALTER TABLE documents ADD COLUMN reviewed_at TEXT;`);
}
```

**For the `documents.status` CHECK constraint, do not attempt an in-place
change.** SQLite cannot alter a CHECK; the documented fix is a full table
rebuild, and rebuilding a table that four other tables hold foreign keys into is
a genuinely error-prone dance involving `legacy_alter_table`. You have two sane
options and I recommend the first:

- **Delete your dev tenant DBs and re-upload your test documents.** You are
  pre-users. `rm api/db/tenant/*.sqlite`, restart, register again. Thirty
  seconds, zero risk. While you're editing the DDL anyway, **drop the CHECK on
  `documents.status` entirely** and let the `DocumentStatus` TS union in
  [document.model.ts:8](../api/src/features/document/models/document.model.ts#L8)
  be the enforcement. Every future status you add is then free.
- If you have data you care about, write the rebuild as a one-off script under
  `api/src/db/migrations/`, run it manually, and don't put it in the boot path.

New status values, whichever route you take:

```
uploaded → processing → extracted → reviewed → indexed
                    ↘ failed
```

`extracted` now means *"the model has answered, a human has not looked."* That is
the state the review UI lists. `indexed` is Phase 5's business; define it now so
you don't rebuild the constraint twice.

## 2. `api/src/db/tenantDb.ts` — replace `extractedDocumentText`

The current table cannot hold this phase's data:
[tenantDb.ts:60-70](../api/src/db/tenantDb.ts#L60-L70) has no `column_id`, its
`UNIQUE(document_id, schema_id)` caps it at **one row per document**, and both
`value_text` and `value_number` are `NOT NULL` — every row would need to be
simultaneously a string and a number. Nothing has ever written to it (grep
confirms: DDL and one unused interface), so replace it outright rather than
migrating it.

```sql
DROP TABLE IF EXISTS extractedDocumentText;

CREATE TABLE IF NOT EXISTS extracted_values (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES schema_columns(id) ON DELETE CASCADE,

    -- What the model said. Frozen at extraction time, never overwritten by an
    -- edit. This is what lets you measure hallucination rate per column later.
    llm_value      TEXT,
    llm_quote      TEXT,

    -- The reviewed truth. Seeded from llm_value, edited in the UI, coerced
    -- server-side on save.
    value_text     TEXT,
    value_number   REAL,
    value_date     TEXT,

    -- Resolved server-side. Offsets are into pages_json[source_page-1].text
    -- and are NOT valid against the PDF text layer. See "The seam" above.
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

`UNIQUE(document_id, column_id)` makes re-extraction an upsert rather than a
duplicate-row bug — the same reason `phase3-extraction.md` §10 called for it.

Note there is deliberately **no `fuzzy` in `match_kind`**. See §5.

## 3. `api/src/db/adminDB.ts` — job types

Add a type column so Phase 5's indexing jobs share this queue:

```sql
ALTER TABLE extraction_jobs ADD COLUMN type TEXT NOT NULL DEFAULT 'extract';
```

Guard it with the same `hasColumn` helper. `'extract'` means parse-then-extract
(what `runJob` does today plus §8). `'index'` arrives next phase. Cheapest
possible moment to add this is now, while exactly one type exists.

`QUEUE_SQLS.claimJob` ([job.sql.ts:2-14](../api/src/features/extraction/sql/job.sql.ts#L2-L14))
needs no change yet — it claims the oldest queued job of any type, which is
correct until you want type-specific concurrency.

## 4. `api/src/features/extraction/schemaToJsonSchema.ts` — nest the quote

Each property becomes an object instead of a bare `string|null`:

```ts
{
  type: "object",
  properties: {
    value: { type: ["string", "null"] },
    quote: { type: ["string", "null"] },
    page:  { type: ["integer", "null"] },
  },
  required: ["value", "quote", "page"],
  additionalProperties: false,
}
```

Enum columns keep their enum — it just moves down a level, onto `.value`. That
grammar-level constraint is still the one piece of free correctness you get
([schemaToJsonSchema.ts:37-45](../api/src/features/extraction/schemaToJsonSchema.ts#L37-L45)),
don't lose it in the refactor.

`fieldLines` and `keyToColumnId` are unchanged.

Two consequences to plan for:

- **Output tokens roughly triple.** `num_predict: 1024`
  ([ollama.ts:21](../api/src/features/extraction/llms/ollama.ts#L21)) is now
  tight for a 10-column schema — a truncated generation produces invalid JSON
  and `JSON.parse` throws at
  [ollama.ts:36](../api/src/features/extraction/llms/ollama.ts#L36). Raise it to
  `2048`. Input at `MAX_INPUT_CHARS = 16000` is ~4.5k tokens, so 4.5k + 2k still
  fits inside `num_ctx: 8192` and your 6 GB budget is unchanged.
- **The prompt must explicitly demand a verbatim quote.** Ollama's `format`
  compiles to a decoder grammar the model never reads — that's still the trap
  from `phase3-extraction.md` §12. The grammar will force a `quote` key to
  exist; only the prompt text can make it a *real* one.

Prompt additions, appended to the existing system message:

```
For each field also return:
- "quote": the exact sentence or line from the document that contains the
  answer, copied character-for-character. Do not paraphrase, do not clean it up,
  do not fix typos. If you cannot find the answer, return null.
- "page": the page number the quote came from, read from the "--- page N ---"
  markers in the document. The first page has no marker.
```

That last clause matters: `joinPages` only prefixes pages 2..n
([text.util.ts:15-19](../api/src/features/parsing/utils/text.util.ts#L15-L19)),
so without it the model reads the first `--- page 2 ---` marker and concludes
everything above it is page 2.

## 5. `api/src/features/extraction/resolveQuote.ts` — new

The verification step. This file is the entire reason the feature works.

```ts
export interface QuoteLocation {
  page: number | null;
  start: number | null;
  end: number | null;
  matchKind: "exact" | "normalized" | "none";
  confidence: number;
}

export function resolveQuote(
  quote: string | null,
  pages: ParsedPage[],
  hintedPage: number | null,
): QuoteLocation;
```

Cascade, in order:

1. **Exact.** `indexOf` on the hinted page first, then every other page. Try the
   hint first not for speed but because a short quote can legitimately appear on
   several pages, and the model's hint is the tiebreak.
2. **Normalized.** Strip *all* whitespace from both haystack and needle, match,
   then map the hit back to original offsets. `matchKind: "normalized"`.
3. **Nothing.** `matchKind: "none"`, `page`/`start`/`end` all null.

Confidence: `0.9` exact, `0.7` normalized, `0.0` none.

**Do not add a fuzzy tier.** It is tempting and it is wrong here: fuzzy matching
makes an invented quote resolve to a real-looking passage, which is precisely
the failure this entire phase exists to catch. A false "verified" badge is worse
than no badge. Exact + whitespace-normalized covers every legitimate quoting
behavior a model exhibits.

The fiddly part is step 2's index map. Build it in one pass:

```ts
// normalized[i] came from original index origIndex[i]
const norm: string[] = [];
const origIndex: number[] = [];
for (let i = 0; i < text.length; i++) {
  if (!/\s/.test(text[i])) {
    norm.push(text[i]);
    origIndex.push(i);
  }
}
```

A hit at normalized `[a, b)` maps to original `[origIndex[a], origIndex[b-1] + 1)`.
Do not try to compute this arithmetically from whitespace counts; the map is
cheaper to write and impossible to get subtly wrong.

**Optional cheap win:** after locating the quote, check the *value* also appears
inside the quote (whitespace-stripped, case-insensitive). If it doesn't, the
model found a real passage but derived an answer that isn't in it — a distinct
and fairly common 7B failure. Downgrade confidence to `0.4`. Skip this on the
first pass if you want to see the raw behavior first.

## 6. `api/src/features/extraction/coerce.ts` — new

Never written in Phase 3 despite §14 calling for it. Build it now, because
**this phase needs it twice** — once on the model's output and once on the
human's edit.

```ts
export interface CoercedValue {
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
}

export function coerce(raw: string | null, dataType: ColumnDataType,
                       enumOptions: string[] | null): CoercedValue;
```

Rules per `data_type` are exactly as `phase3-extraction.md` §14 laid out — the
table there is still correct, including the warning about never handing
ambiguous `03/04/2026` strings to `new Date()`. Two additions for this phase:

- Every coercion failure is `null`, never a throw. One bad field must not sink
  the other nine, and in the review UI it must not 500 the save.
- For `number`, keep the original string in `value_text` as well as the parsed
  value in `value_number`. The UI shows `value_text`; the query layer uses
  `value_number`. Losing `$1,234.56` and showing `1234.56` back to a reviewer
  makes them think the model mangled it.

## 7. `api/src/features/extraction/extractionService.ts` — new

`extractDocument(db, documentId): void` — takes the already-open tenant DB
handle rather than a `userId`, so the worker's single connection is reused and
you don't open a second one mid-job.

Order:

1. Load document, its schema's ordered columns, and its `parsedDocumentText` row.
   **`schema_columns.enum_options` comes back as a raw JSON string** and must be
   parsed — same convention noted in `CLAUDE.md`.
2. `JSON.parse(row.pages_json)` → `ParsedPage[]`. You need the pages, not the
   joined `text`, for `resolveQuote`.
3. No columns → no-op success.
4. `schemaToJsonSchema(columns)` → `{ schema, keyToColumnId, fieldLines }`.
5. Truncate the joined `text` to `MAX_INPUT_CHARS` (16000) for the prompt.
6. `provider.complete({ system, prompt, schema })`.
7. For each `[slug, { value, quote, page }]`:
   - `columnId = keyToColumnId.get(slug)` — skip unknown slugs rather than
     throwing; `additionalProperties: false` should prevent them, but a
     grammar can be defeated by a truncated generation.
   - `coerce(value, col.data_type, enumOptions)`
   - `resolveQuote(quote, pages, page)`
   - upsert into `extracted_values` with `llm_value = value`,
     `llm_quote = quote`, `review_status = 'unreviewed'`.

Wrap the per-field loop in a `db.transaction(...)` so a document is never half
extracted.

**Truncation caveat worth a comment in the code:** because the prompt is capped
at 16k characters, a quote can only ever come from the first ~6 pages. On a
longer document, fields genuinely present on page 20 will come back `null` with
`match_kind: 'none'` — which looks identical to a hallucination in the UI but
isn't. Phase 5's chunking is the real fix. Until then, don't demo this on a
40-page contract.

## 8. `api/src/features/extraction/worker.ts` — wire step 4

Currently `runJob` parses and stops
([worker.ts:71-88](../api/src/features/extraction/worker.ts#L71-L88)). Insert
between the `DOCUMENT_TEXT_SQL.upsert` and `completeJob`:

```
extractDocument(db, job.document_id);
db.prepare(DOCUMENT_SQL.updateStatus).run("extracted", job.document_id);
```

Note the comment at [worker.ts:85-86](../api/src/features/extraction/worker.ts#L85-L86)
("only change to extracted after LLMs") — this is the change it was waiting for.
Delete the comment once it's true.

Error handling: extend the `permanent` check to cover the Ollama 404 case. The
provider already tags it (`(err as any).permanent = true` at
[ollama.ts:31](../api/src/features/extraction/llms/ollama.ts#L31)) but
`runJob`'s catch only inspects `ParsingError`
([worker.ts:90-92](../api/src/features/extraction/worker.ts#L90-L92)), so an
unpulled model currently burns all three attempts. Add:

```ts
const permanent =
  (error instanceof ParsingError && (error.code === "unsupported" || error.code === "encrypted")) ||
  (error as { permanent?: boolean })?.permanent === true;
```

A connection-refused (Ollama not running) must stay retryable.

## 9. `api/src/features/extraction/sql/review.sql.ts` — new

- `getValuesByDocument` — join `extracted_values` to `schema_columns` for
  `name`, `data_type`, `enum_options`, `position`; order by `position`.
- `upsertValue` — `ON CONFLICT(document_id, column_id) DO UPDATE`.
- `updateReviewedValue` — sets `value_text/value_number/value_date`,
  `review_status`, `reviewed_at = datetime('now')` for one `(document_id, column_id)`.

Keep these separate from `DOCUMENT_TEXT_SQL`. The list query stays untouched —
the reason `parsedDocumentText` is its own table is to keep `GET /documents`
lean, and that logic applies here too.

## 10. `api/src/features/extraction/services/reviewService.ts` — new

```ts
getReviewPayload(userId: number, documentId: number): ReviewPayload | undefined;
saveReview(userId: number, documentId: number, edits: ReviewEdit[]): void;
```

`ReviewPayload` is everything the split panel needs in **one** request:

```ts
{
  document: DocumentListItem;
  pages: { page: number; source: "text" | "ocr"; text: string }[];
  fields: ReviewField[];
}
```

Include the page `text` even though the PDF path doesn't strictly need it — it
is what the non-PDF fallback renders (§20) and what lets the right panel show a
context snippet without a second round trip. A 25 MB PDF yields a few hundred KB
of text at worst, fetched once per review session.

`pages[].source` is the OCR flag, already recorded per page by the parser
([types.ts:10-14](../api/src/features/parsing/types.ts#L10-L14)). The UI needs
it: **an OCR'd page has no PDF text layer, so it cannot be highlighted.** The
panel must say so rather than silently doing nothing on click.

`saveReview` gotchas, both easy to get wrong:

- **Coerce on the server, not the client.** The reviewer types a string. If you
  store it straight into `value_text`, a corrected date never reaches
  `value_date` and the Phase 5 query layer can't filter on it. Run every edit
  through `coerce()` from §6.
- **One transaction for the whole save**, then flip `documents.status` to
  `'reviewed'` and set `reviewed_at`. This is the gate: nothing downstream
  should ever look at a document that isn't `reviewed`.
- `review_status` per field: `'accepted'` if the value is unchanged from
  `llm_value`, `'edited'` if changed, `'rejected'` if the reviewer cleared it.
  Derive it server-side from the comparison rather than trusting the client's
  label — it's the accuracy metric, and a buggy client shouldn't be able to
  corrupt it.

## 11. `api/src/features/document/controllers/documentController.ts` — serve the file

New handler `getDocumentFile`. The left panel cannot render a PDF it can't fetch.

```ts
export function getDocumentFile(req: Request<{ id: string }>, res: Response)
```

- Reuse `documentService.getDocById(userId, docId)`. Tenancy is already safe:
  it opens *that user's* tenant DB, so another tenant's id simply 404s.
- `res.type(document.mime_type)`, `Content-Disposition: inline`, then
  `res.sendFile(resolveStoragePath(document.storage_path))`.
- `sendFile` needs an absolute path and throws asynchronously — pass a callback
  and 404 on `ENOENT` rather than letting it become an unhandled 500. A row
  whose file is missing on disk is possible (the `deleteDocument` ordering
  comment at [documents.services.ts:84-86](../api/src/features/document/services/documents.services.ts#L84-L86)
  explicitly accepts that risk).

## 12. Routes

In `api/src/routes/documents.ts`, before the multer error handler:

```ts
router.get("/:id/file", getDocumentFile);
router.get("/:id/review", getReview);
router.patch("/:id/review", saveReview);
```

Order matters — these must come before nothing in particular here, since
`/:id` won't shadow `/:id/file`, but keep them grouped above the `router.use`
error handler or Express won't reach them.

### PR #4 done when

Upload an invoice, and `GET /api/documents/:id/review` returns one field per
schema column with a `quote`, a `source_page`, and a `match_kind`. Specifically
verify all three of these by hand:

- A field the model got right → `match_kind: 'exact'`.
- A field you know is absent from the document → `value: null`, and if the model
  invented something anyway, `match_kind: 'none'`. **This is the test that
  proves the feature works.** If you can't get a hallucination to occur
  naturally, force one: point a resume schema at an invoice.
- `GET /api/documents/:id/file` streams the PDF with the right content type.

---

# PR #5 — the split-panel review UI

## 13. Dependencies and worker setup

```bash
npm i react-pdf
```

`react-pdf@10.4.1` declares `react: ^19` in its peer range, so it's compatible
with your React 19.2 — verified, no `--legacy-peer-deps` needed. It brings its
own `pdfjs-dist`; do **not** install `pdfjs-dist` separately or you'll ship two
copies of PDF.js and the worker version check will fail at runtime.

Worker wiring, once, in `main.tsx` or a dedicated `pdfWorker.ts`:

```ts
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
```

The `new URL(..., import.meta.url)` form is what lets Vite fingerprint and serve
the worker; a bare string path works in dev and 404s in the production build,
which is a miserable thing to discover after deploy.

You also need the text layer CSS or **every highlight rect will be wrong** — the
spans collapse without it:

```ts
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
```

Confirm the exact path against your install (`ls node_modules/react-pdf/dist/Page/`)
— it moved between v7 and v9 and the package exports `"./*": "./*"`, so a wrong
path fails as a bare module-resolution error rather than anything descriptive.

## 14. `frontend/src/types/index.ts`

```ts
export type MatchKind = "exact" | "normalized" | "none";
export type FieldReviewStatus = "unreviewed" | "accepted" | "edited" | "rejected";

export interface ReviewField {
  column_id: number;
  name: string;
  data_type: ColumnDataType;
  enum_options: string[] | null;
  llm_value: string | null;
  llm_quote: string | null;
  value_text: string | null;
  source_page: number | null;
  match_kind: MatchKind | null;
  confidence: number | null;
  review_status: FieldReviewStatus;
}

export interface ReviewPage { page: number; source: "text" | "ocr"; text: string; }

export interface ReviewPayload {
  document: DocumentListItem;
  pages: ReviewPage[];
  fields: ReviewField[];
}
```

Add `"reviewed" | "indexed"` to the existing `DocumentStatus` union
([types/index.ts:37](../frontend/src/types/index.ts#L37)) and give both a colour
in `DocumentStatusChip`.

## 15. `frontend/src/api/review.ts`

`getReview(id)` and `saveReview(id, edits)` through `apiFetch`, per house style
with explicit arrow callbacks.

## 16. `frontend/src/hooks/useDocumentFile.ts`

`apiFetch` puts the JWT in an `Authorization` header
([client.ts:14-17](../frontend/src/api/client.ts#L14-L17)), and
`<Document file="/api/...">` is a plain browser fetch that cannot set one. So:
fetch the bytes yourself, wrap in an object URL.

```ts
export function useDocumentFile(documentId: number): {
  fileUrl: string | null; loading: boolean; error: string | null;
}
```

- Fetch as a blob. `apiFetch` always calls `res.json()`
  ([client.ts:113](../frontend/src/api/client.ts#L113)) so it can't be reused
  here — call `fetch` directly with `authHeaders`, or export a `apiFetchBlob`
  variant. The second is better; the 401-refresh logic in `apiFetch` is worth
  not duplicating.
- `URL.createObjectURL(blob)` → return it.
- **`URL.revokeObjectURL` in the effect cleanup.** Skip this and every review
  session you open leaks the whole PDF into memory until reload.
- Guard against the fetch resolving after unmount before you `createObjectURL`.

## 17. `frontend/src/hooks/useQuoteHighlight.ts` — the core

This is the piece that makes the feature work, and it is the one place worth
writing carefully. Given a container element and a quote string, produce DOM
rects.

**Use a DOM `Range`, not PDF.js transform math.** You could compute rects from
`item.transform` + `viewport.transform` matrices, but a `Range` gets you
browser-accurate text measurement, correct handling of PDF.js's per-span
`transform: scaleX()` letter-spacing hack, and — for free — **one rect per line
when a quote wraps**, via `getClientRects()`. The matrix approach requires you
to reimplement line-breaking yourself.

```ts
export function findQuoteRects(container: HTMLElement, quote: string): DOMRect[];
```

Algorithm:

1. `document.createTreeWalker(container, NodeFilter.SHOW_TEXT)` — collect text
   nodes in document order into `nodes[]`.
2. Build `full = nodes.map(n => n.data).join("")` plus `starts[i]` = the index
   in `full` where node `i` begins.
3. Build the whitespace-stripped `norm` + `origIndex` map over `full`, using the
   **exact same one-pass loop as §5**. Do the same to the quote. Match.
4. Map the normalized hit back to `[origStart, origEnd)` in `full`.
5. Binary-search `starts` to find which node contains each end, then
   `range.setStart(nodes[i], origStart - starts[i])` and likewise `setEnd`.
6. `Array.from(range.getClientRects())`.
7. Subtract `container.getBoundingClientRect()` top/left to get
   container-relative coordinates.

Why the whitespace-stripped pass is mandatory rather than a fallback: PDF.js
text items are positioned, not spaced, so the text layer routinely reads
`ACMESUPPLYCO` where the server's parsed text reads `ACME SUPPLY CO`. An exact
match will miss on a large fraction of real quotes. Run the stripped comparison
as the primary path.

The payoff for doing it over the DOM: **this exact function also works on the
plain-text fallback in §20.** One highlight implementation, two renderers.

## 18. `frontend/src/components/review/PdfViewer.tsx`

`<Document file={fileUrl}>` + `<Page pageNumber={n} renderTextLayer />`.

- Render **all** pages in a scroll container rather than one page at a time.
  Click-to-navigate becomes `scrollIntoView` on an element you already have,
  instead of a page-swap plus a re-find plus a scroll. Lazy-render offscreen
  pages later if a 40-page document drags.
- Keep a `Map<number, HTMLElement>` of page wrapper refs so the parent can
  scroll to a page by number.
- **Highlights must be computed after `onRenderTextLayerSuccess`, not after
  `onLoadSuccess`.** The text layer mounts asynchronously; run
  `findQuoteRects` before it exists and you get an empty array with no error.
- Recompute on scale change and on window resize. Rects are layout-dependent.

## 19. `frontend/src/components/review/HighlightLayer.tsx`

Absolutely-positioned `<div>`s over one page, `pointer-events: none`, from the
rects in §17. Two visual states: every located field faintly, the selected field
prominently. Use `theme.palette.warning.light` at low alpha and
`theme.palette.primary.main` — don't hardcode colours, the app has a theme.

Alternative worth knowing: the CSS Custom Highlight API (`CSS.highlights.set()`)
takes `Range` objects directly and needs no overlay elements at all. It's
cleaner, and browser support is fine in 2026. The overlay-div version is more
predictable to style per-state and works everywhere, so start there; the Range
objects you already have make switching later a small change.

## 20. `frontend/src/components/review/TextViewer.tsx`

The fallback for everything that isn't a PDF. DOCX, TXT, and standalone images
all flow through the same upload path and reach this page, and `<Document>` will
simply fail on them.

Render `pages[].text` in a `<pre>` per page, and point the *same*
`findQuoteRects` at it. Because the hook works on any DOM subtree, this is a
renderer swap and nothing more.

Choose between viewers on `document.mime_type === "application/pdf"`.

## 21. Right panel components

Per `CLAUDE.md`'s component rule, split rather than nesting this into one file:

- **`ExtractedFieldList.tsx`** — maps fields to rows, owns nothing.
- **`ExtractedFieldRow.tsx`** — label, editable input, confidence badge. Clicking
  anywhere on the row (not just the value) fires `onLocate(field)`. Input type
  follows `data_type`: a `Select` for `enum` seeded from `enum_options`, a plain
  `TextField` otherwise — do not use `type="date"`, `coerce()` on the server is
  more forgiving than a native date picker is.
- **`FieldConfidenceBadge.tsx`** — the whole point of the panel. Three states:
  `exact` → quiet check, `normalized` → neutral, `none` → **loud warning**, e.g.
  "not found in document." Do not render `none` as "0.0 confidence"; a number
  invites the reviewer to skim past it, a warning does not.
- **`ReviewSaveBar.tsx`** — sticky footer, dirty-field count, Save button.
  Disabled when nothing is dirty.

## 22. `frontend/src/pages/DocumentReviewPage.tsx`

Route `/documents/:id/review`, inside `ProtectedRoute` → `Layout` in
[AppRouter.tsx:28-36](../frontend/src/router/AppRouter.tsx#L28-L36).

Owns: the `ReviewPayload`, the per-field edit map, `selectedColumnId`, save
state. Passes `onLocate` down and holds the ref to the viewer.

Also change [RenderDocuments.tsx:71-75](../frontend/src/components/document/RenderDocuments.tsx#L71-L75)
so the filename becomes a `<MuiLink component={RouterLink}>` to the review page
when status is `extracted` or `reviewed`, and stays plain text otherwise. That's
the only entry point, so don't skip it.

**The one flow to get right**, since it's the feature: clicking a field row →
look up `field.source_page` → scroll that page wrapper into view → run
`findQuoteRects` against that page's text layer → set the highlight. When
`match_kind` is `'none'` there is nothing to scroll to; show the warning badge
and leave the left panel alone rather than jumping to page 1. When the target
page has `source: 'ocr'`, scroll to the page but show "this page was read by
OCR — the exact location can't be shown" instead of an empty highlight.

### PR #5 done when

Open an extracted invoice, click "Invoice Number" in the right panel, and the
left panel scrolls to and highlights the invoice number on the actual PDF page.
Edit a wrong value, hit Save, and the grid row flips to `reviewed`. Then the
tests that matter:

- A field with `match_kind: 'none'` shows the warning and does not navigate.
- An OCR'd page shows the OCR notice rather than failing silently.
- Upload a `.txt` against the same schema — the fallback viewer highlights it.
- Reload the page after saving; the edits are still there and `review_status` is
  `'edited'` on exactly the fields you changed.

---

## Standing risks

- **The 16k truncation now has a visible failure mode.** A field on page 20 comes
  back `match_kind: 'none'`, which the UI presents as "not found in document" —
  indistinguishable from a hallucination to the reviewer, and it's actually the
  prompt's fault. Consider logging the truncation point and, if the extraction
  input was truncated, softening the badge copy to "not found in the portion of
  the document that was read."
- **Highlighting depends on a PDF text layer that OCR pages don't have.**
  Tesseract can emit word-level bounding boxes, which would eventually let you
  draw real highlights on scanned pages, but that means storing bboxes in
  `pages_json` and a second rect path. Not this phase — just make the
  degradation honest.
- **`llm_value` is only worth storing if you look at it.** The whole reason for
  freezing it alongside the reviewed value is to compute per-column accuracy
  ("the model gets `total_amount` right 94% of the time, `vendor_address` 40%").
  That query is trivial once the data exists and impossible to reconstruct
  afterward. Worth a small stats endpoint next phase.
- **Review is now a hard gate on indexing.** A user who uploads 50 documents and
  reviews none has a query layer that returns nothing, with no explanation. Phase
  5 needs a "12 documents awaiting review" prompt on the query page, or the
  feature reads as broken.
- **SQLite is still single-writer and the worker still runs one job at a time.**
  Extraction just got slower (triple the output tokens). A batch of 20 uploads
  will queue visibly. That's fine — do not add concurrency to hide it.
