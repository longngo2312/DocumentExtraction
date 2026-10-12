# Phase 5 — Provenance-preserving parsing: spans, offsets and bounding boxes

Build guide for the design in "Provenance-preserving parsing". Ordered stages;
each file has its own checklist.

**Status: implemented 2026-08-30.** The notes below were written before the work
and corrected against it — see [What changed during implementation](#what-changed-during-implementation)
for the five things the plan got wrong, each of which is a trap worth knowing.

**Read [The invariant](#the-invariant) before writing any parser code.** It is the
one thing here whose failure mode is silent.

**Scope decision (2026-08-30):** office files keep previewing as parsed text — the
frontend does not learn to render docx/xlsx/pptx originals. Instead the office
parse goes *structural*, so that text preview is worth reading. Reasoning is in
[Why office stays text](#why-office-stays-text); the work is Stage 4.

---

## Library facts (verified against installed versions)

| Claim | Status |
| --- | --- |
| `pdf-parse@2.4.5` `getText()` returns `{num, text}` only | confirmed — no geometry |
| `pdfjs-dist@5.4.296` installed, `legacy/build/pdf.mjs` present | confirmed |
| `Util` exported from that build | confirmed (`Util.transform` at `types/src/shared/util.d.ts:393`) |
| `tesseract.js@7` `recognize(image, opts, output)` + `OutputFormats.blocks` | confirmed |
| Word boxes at `blocks[].paragraphs[].lines[].words[].bbox` `{x0,y0,x1,y1}` | confirmed |
| pdf-parse `Screenshot` carries `width`/`height`/`scale` | confirmed |
| `@napi-rs/canvas` present transitively | confirmed (`@napi-rs/canvas-win32-x64-msvc`) |
| `mammoth@1.11.0`, `xlsx@0.20.3`, `xml2js@0.6.2`, `fflate@0.8.2` installed | confirmed — hoisted to top level, pulled in by `office-text-extractor` |
| `@types/mammoth` on npm | **wrong — 404.** A local `src/types/mammoth.d.ts` declares the two functions used |
| `mammoth.extractRawText` separates paragraphs with `\n\n`, tabs as `\t` | confirmed (`node_modules/mammoth/lib/raw-text.js`) |
| Type declarations | `xlsx` and `fflate` ship their own; **`mammoth` and `xml2js` ship none** |

`api/tsconfig.json` is `module: NodeNext` — the pdfjs subpath import resolves
types through `legacy/build/pdf.d.mts`, which is `export * from "pdfjs-dist"`.

---

## The invariant

**`ParsedPage.text` must be assembled from the spans, in the same loop that
records their offsets.**

For every span: `page.text.slice(span.start, span.end)` must equal the text that
span came from. `normalizeWhiteSpace()` after the fact shifts every offset —
trailing-space stripping and newline collapsing both delete characters — so it
must not touch page text once spans exist.

This now applies to **every** parser, office included. The old plan let office
normalize first and emit one whole-page span; going structural means office
builds its page strings cell by cell and paragraph by paragraph, exactly as the
PDF path does. `normalizeWhiteSpace` survives only in `text.parser.ts`, where the
single span covers the whole file and is created from the normalized string.

Consequence to expect: page text now keeps trailing spaces and runs of 3+
newlines, so `charCount` goes up slightly and a little more of each document gets
eaten by `MAX_INPUT_CHARS = 16000` in
[extraction.service.ts:16](../api/src/features/extraction/services/extraction.service.ts#L16).
Leave that constant alone this phase; just know why the number moved.

---

## Why office stays text

The alternative was teaching the frontend to render docx/xlsx/pptx originals.
Rejected, because:

- **The argument that justifies the PDF viewer doesn't transfer.** You show the
  original PDF because the parsed text is a *lossy derivative* — OCR misreads,
  column order, ligatures — and the reviewer needs the real thing to audit
  against. A docx has no such read-risk; the parsed text essentially is the
  content.
- **Client-side office rendering re-introduces what this phase removes.** A
  `docx-preview` or `sheet_to_html` DOM has no relationship to the offsets the
  server produced, so highlighting there means text-searching the rendered HTML —
  kept alive permanently for the one format family where it could never be retired.
- **Fidelity would still be poor.** docx is tolerable, xlsx renders as a plain
  table anyway, pptx has no good browser renderer.

If a corpus ever genuinely demands office fidelity, the answer is **server-side
LibreOffice → PDF conversion**, not client-side renderers: office files would
then reuse the whole PDF path — real spans, real boxes, `react-pdf`, no new
viewer code. Phase 4 rejected that for weight. Going structural now does not
block it.

What structural office parsing buys, beyond a readable preview: it fixes a bug
you have not hit yet. **Every office file is currently `page: 1`**, so the LLM's
`page` hint is meaningless on them and `resolveQuote`'s hinted-page tiebreak is a
no-op. Per-sheet and per-slide pages make it work.

What it does not buy: a docx whose layout carries meaning — letterhead, a
signature block, a table that reads visually — is still reviewed as text.

---

## Stage 0 — Reset (do this first)

`openTenantDB` only runs `CREATE TABLE IF NOT EXISTS`, so a new column never
appears on an existing DB.

- [ ] Stop the API and the frontend dev server.
- [ ] `rm api/db/tenant/*.sqlite*` and `rm api/db/admin.sqlite*` — the trailing `*`
      catches `-wal` and `-shm`.
- [ ] Delete everything under `api/storage/uploads/`.
- [ ] Re-register a user, rebuild one schema. Do not re-upload yet — parsers change first.

---

## Stage 1 — Types and dependencies

### `api/package.json`

- [ ] Add `"pdfjs-dist": "5.4.296"` to `dependencies` — **exact, no caret.** It
      resolves today only because npm hoisted pdf-parse's copy. A caret pulls
      5.7.x, and then pdf-parse's nested 5.4 API meets the hoisted 5.7 worker:
      *"The API version 5.4.296 does not match the Worker version 5.7.284"*, which
      aborts every render. Pinning also lets npm dedupe the two into one copy.
- [ ] Promote the office libraries to direct dependencies — Stage 4 imports them
      by name, and they are currently only present because
      `office-text-extractor` pulled them in:

```jsonc
"mammoth": "^1.11.0",
"xml2js": "^0.6.2",
"fflate": "^0.8.2",
// NOT from the public registry — see below
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
```

- [ ] **`npm i xlsx` gets you the wrong package.** SheetJS left the public
      registry; the name there is frozen at a deprecated 0.18.5. Copy the CDN
      tarball URL above, which is exactly what `office-text-extractor` pins.
- [ ] Add `@types/xml2js` to `devDependencies`. **`@types/mammoth` does not
      exist** (npm 404) — declare the two functions used in
      `api/src/types/mammoth.d.ts` instead, which `tsconfig`'s `include: ["src"]`
      picks up automatically. (`xlsx` and `fflate` ship their own types.)
- [ ] Add `"@napi-rs/canvas": "0.1.80"` — **exact**, matching what pdf-parse
      pinned. It is imported directly now (image dimensions, and rasterizing
      pages for OCR). `^0.1.80` resolves to 0.1.100, whose Path2D handling pdfjs
      5.4 rejects with *"Value is non of these types `String`, `Path`"*.
- [ ] **Remove `office-text-extractor`.** Stage 4 replaces every call to it. It
      also drags in a second copy of `pdf-parse`, so dropping it is a net
      simplification — but only *after* the four libraries above are direct deps,
      or they vanish with it.
- [ ] **Remove `pdf-parse` entirely.** The plan kept it for `getScreenshot()`,
      but that turned out to be unusable here — see
      [What changed](#what-changed-during-implementation). pdfjs rasterizes pages
      itself in ~15 lines, so nothing is left for pdf-parse to do.

### `api/src/features/parsing/types.ts`

- [ ] Add the geometry types:

```ts
/** Normalized to 0..1 against the page box, origin top-left. Render-scale independent. */
export type NormalizedBox = [x0: number, y0: number, x1: number, y1: number];

export interface ParsedSpan {
  id: number;                  // unique within the document
  start: number;               // [start, end) into ParsedPage.text
  end: number;
  bbox: NormalizedBox | null;  // null for formats with no geometry
  /**
   * Format-native address, when one exists — a spreadsheet cell ("B7").
   * For a spreadsheet this *is* the provenance answer, the way a rect is for a
   * PDF: without it a quote's origin is only ever "somewhere in Sheet 2".
   */
  ref?: string;
}
```

- [ ] Extend `ParsedPage`:

```ts
export interface ParsedPage {
  page: number;
  text: string;
  source: "text" | "ocr";
  spans: ParsedSpan[];
  /** Page box in its own units — points for PDF, pixels for images, 0 for office. */
  width: number;
  height: number;
  /** Human name for the unit when "page N" is wrong: "Q3 Actuals", "Slide 4". */
  label?: string;
}
```

- [ ] Replace `"office"` in `ParseMethod` with `"docx" | "xlsx" | "pptx"`. The
      column has no CHECK constraint and the DB is being wiped anyway, so this is
      free, and it makes `parsedDocumentText.method` actually diagnostic.

Span granularity is whatever the format natively produces: one span per pdfjs
`TextItem`, per Tesseract word, per spreadsheet cell, per docx or pptx paragraph.
Do not split PDF items into words — that means estimating character widths from
`item.width`, inventing precision the PDF never gave us.

`ParserResult` needs no change; it is still `Omit<ParsedDocument, "charCount" | "durationMs">`.

### `api/src/features/parsing/utils/text.util.ts`

- [ ] `joinPages` has to carry labels through, so the LLM can still resolve a
      page hint on a spreadsheet:

```ts
export function joinPages(pages: Pick<ParsedPage, "text" | "label">[]): string
```

Marker becomes `--- page 2 (Q3 Actuals) ---` when a label exists, and stays
`--- page 2 ---` when it does not. **Keep the number, and keep it first** —
`SYSTEM_PROMPT` in `extraction.service.ts` tells the model to read the number out
of these markers, and that instruction stays unchanged.

- [ ] Update the one existing call, `pdf.parser.ts:92`, from
      `joinPages(pages.map((p) => p.text))` to `joinPages(pages)`.
- [ ] `normalizeWhiteSpace` and `hasUsableText` are unchanged.

---

## Stage 2 — OCR returns boxes

### `api/src/features/parsing/ocr/tesseract.ts`

Currently returns `res.data.text` and drops everything else.

- [ ] New return type, exported:

```ts
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number }; // image pixel space
}

export interface OcrResult {
  words: OcrWord[];
}
```

- [ ] Change the signature to `OcrImage(png: Uint8Array): Promise<OcrResult>`.
- [ ] Call `worker.recognize(Buffer.from(png), {}, { blocks: true })`. Without the
      third argument `data.blocks` is `null` and you get no boxes at all — this is
      the whole point of the change.
- [ ] Walk `data.blocks → paragraphs → lines → words`, pushing `{ text, bbox }`.
      Guard `blocks` for null; recognition can still return it on a page with
      nothing on it.
- [ ] **Do not return `data.text`.** Callers assemble the page string from the
      words so offsets and boxes are produced together. Returning both invites a
      caller to take the text and the boxes from different sources.
- [ ] Keep the `errorHandler: () => {}` on `createWorker`, and `shutdownOcr` as is.

### New: `api/src/features/parsing/utils/spans.util.ts`

Shared span-assembly helpers. Every parser in Stages 3 and 4 uses something here,
which is the point — the invariant is easier to hold in one file than in six.

- [ ] `export function pageFromWords(words: OcrWord[], pageWidth: number, pageHeight: number, nextSpanId: () => number): { text: string; spans: ParsedSpan[] }`
- [ ] Join words with a single space, newline between lines. Tesseract's word
      order is reading order; a `y0` jump beyond ~half a line height is a line
      break. Record `[start, end)` around each word as you append, and normalize
      its bbox by dividing x by `pageWidth` and y by `pageHeight`.
- [ ] Clamp every normalized value into `0..1` here rather than at each call site —
      Tesseract occasionally emits a box a pixel outside the image.
- [ ] `export function pageFromBlocks(blocks: { text: string; ref?: string }[], separator: string, nextSpanId: () => number): { text: string; spans: ParsedSpan[] }`
      — the geometry-free sibling, used by all three office parsers. Appends each
      block, records its `[start, end)`, carries `ref` through, and emits
      `bbox: null`. Skips blank blocks without emitting a span for them.
- [ ] `export function createSpanIdCounter(): () => number` — ids are unique per
      **document**, not per page, so the counter is created once per parse and
      threaded through every page.

---

## Stage 3 — PDF parser

### `api/src/features/parsing/parsers/pdf.parser.ts`

The largest single file of work. Structure stays: text pass → find pages needing
OCR → OCR loop → method classification → `joinPages`.

- [ ] One library, one read of the bytes. `getDocument({ data })` transfers the
      array to the pdfjs worker and detaches it, so nothing may read it
      afterwards — with pdf-parse gone, nothing needs to.

- [ ] **Rasterize with pdfjs, not pdf-parse.** The plan kept `getScreenshot()`
      for the OCR path; it cannot be used. Both libraries carry their own pdfjs
      and fight over Node's `Path2D` global, so a render that follows our own
      text pass dies with *"Value is non of these types `String`, `Path`"*. It
      reproduces every time and only on the OCR path. `renderPage()` is ~15 lines
      over `@napi-rs/canvas`:

```ts
const viewport = page.getViewport({ scale });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const context = canvas.getContext("2d");
context.fillStyle = "white";           // PDF pages are transparent, and
context.fillRect(0, 0, canvas.width, canvas.height);  // transparent OCRs as black
await page.render({ canvas, canvasContext: context, viewport }).promise;
```

- [ ] **Pass `standardFontDataUrl` and `cMapUrl`.** Without them pdfjs cannot
      load the Base-14 fonts: it warns to the console, *drops glyphs from the
      extracted text*, and renders the rest wrong, so a hybrid page OCRs to
      mangled words. Resolve them off the installed package, as **plain
      filesystem paths with forward slashes** — pdfjs asserts the value ends in
      `"/"`, which `path.sep` fails on Windows, and a `file://` URL makes it
      report the font as unloadable:

```ts
const pdfjsRoot = nodePath
  .dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))
  .replace(/\/g, "/");
// standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`, cMapUrl: `${pdfjsRoot}/cmaps/`
```

  Name the import `nodePath`: every parser takes a `path` parameter, which
  shadows the module.

- [ ] Import from the legacy build:
      `import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";`
- [ ] `getDocument({ data: forPdfjs, isEvalSupported: false, useWorkerFetch: false })`.
      Only `getTextContent()` is called, so no `standardFontDataUrl` and no canvas
      is needed on this path.
- [ ] Keep the try/catch mapping `PasswordException` → `"encrypted"` and anything
      else → `"corrupt"`. pdfjs throws its own `PasswordException`; import it from
      the same build, or match on `error.name === "PasswordException"`.

**Per page:**

- [ ] `const viewport = page.getViewport({ scale: 1 })` — `width`/`height` in points
      with `/Rotate` already applied. These become `ParsedPage.width/height`.
- [ ] `const content = await page.getTextContent()`.
- [ ] **Filter `TextMarkedContent`.** `content.items` is
      `Array<TextItem | TextMarkedContent>` and the latter has only `{ type, id }`.
      Guard with `"str" in item`, which also narrows for TypeScript.
- [ ] Append `item.str`, recording `start` before and `end` after. When
      `item.hasEOL`, append `"\n"` **after** closing the span and count that
      character into the running offset. The newline belongs to no span.
- [ ] Geometry:

```ts
const m = Util.transform(viewport.transform, item.transform);
```

That composition lands in device space — y-down, top-left origin, rotation
applied — so no hand-rolled y-flip and no `/Rotate` special case.

- [ ] **`m[5]` is the text baseline, not the top edge.** The box is:

```
x0 = m[4] / viewport.width
x1 = (m[4] + item.width) / viewport.width
y1 = m[5] / viewport.height              // baseline ≈ bottom
y0 = (m[5] - height) / viewport.height   // top
```

Reading `m[5]` as `y0` puts every highlight one line-height too high, on every
page, consistently enough to look intentional.

- [ ] `item.height` is `0` on some producers. Fall back to the transform's vertical
      scale — `Math.hypot(m[2], m[3])` — and if that is also 0, emit `bbox: null`
      for that span rather than a zero-height rect.
- [ ] Clamp to `0..1`; drop the box where `x0 >= x1` or `y0 >= y1`.
- [ ] **Give whitespace-only items no span.** pdfjs emits `" "` items between
      words. Their text must still land in the page string — every later offset
      depends on it — but a span for a space is noise in `spanIds` and its box
      widens the line rect for nothing. On the sample PDF this is a third of all
      items (445 → 300).
- [ ] `page.cleanup()` per page and `doc.destroy()` at the end, alongside the
      existing `parser.destroy()` in the `finally`.

**OCR pages** — the fallback path keeps its shape:

- [ ] `hasUsableText`, `MIN_CHARS_PER_PAGE`, `OCR_PAGE_CAP` and every warning
      string stay exactly as they are.
- [ ] `renderPage(page, OCR_SCALE)` returns the bitmap with its `width` and
      `height`. **Normalize the word boxes against those, not against the
      viewport.** The boxes are in the 3×-scaled bitmap's pixel space; dividing by
      the page's point dimensions gives highlights at roughly a third of the right
      size, offset up and left — a plausible-looking wrong answer.
- [ ] On the OCR path replace the page's spans as well as its text, and set
      `width`/`height` to the screenshot's. `ParsedPage.width/height` is only ever
      the denominator its own boxes were normalized against, so mixing units
      across pages is fine as long as each page is self-consistent.
- [ ] Drop `normalizeWhiteSpace` from both paths here.

---

## Stage 4 — Office parsers, structural

`office.parser.ts` is replaced by three format-specific parsers. The generic one
existed only because `office-text-extractor` hid the differences; the differences
are the whole point now.

### `api/src/features/parsing/router.ts`

- [ ] Point each OOXML entry at its own parser, in both maps:

| Extension | MIME | Parser |
| --- | --- | --- |
| `.docx` | `…wordprocessingml.document` | `getDocxText` |
| `.xlsx` | `…spreadsheetml.sheet` | `getXlsxText` |
| `.pptx` | `…presentationml.presentation` | `getPptxText` |

- [ ] `SUPPORTED_EXTENSIONS`, `normalizeMime`, and the unsupported-file error
      message are unchanged — the keys of `BY_EXTENSION` do not move.

### New: `api/src/features/parsing/utils/ooxml.util.ts`

- [ ] `export function assertOoxml(bytes: Uint8Array): void` — throw
      `ParsingError("unsupported", …)` unless the first four bytes are
      `50 4B 03 04` (`PK\x03\x04`, the zip local-file header).

This replaces the `UNSUPPORTED_MARKER` string-match that disappears with
`office-text-extractor`, and it covers the real case: a pre-2007 `.doc` renamed
to `.docx`. Keep the existing copy — "This file type cannot be read. Save it as
.docx, .xlsx or .pptx and upload it again." — because it is still exactly right.

- [ ] `export function readZip(bytes: Uint8Array): Record<string, Uint8Array>` —
      thin wrapper over `fflate`'s `unzipSync`, mapping a throw to
      `ParsingError("corrupt", …)`. Used by the pptx parser.

### New: `api/src/features/parsing/parsers/docx.parser.ts`

One page, paragraph spans. A docx has no page breaks recoverable without
rendering it, so `page: 1` stays honest here — unlike xlsx and pptx.

- [ ] `assertOoxml`, then `mammoth.extractRawText({ buffer })`.
- [ ] Paragraphs come back separated by `"\n\n"`, tabs preserved as `"\t"`
      (verified in `mammoth/lib/raw-text.js`). Split on `/\n{2,}/`, drop blanks,
      and feed the blocks to `pageFromBlocks(blocks, "\n\n", nextId)`.
- [ ] **Build the page text from the blocks you split**, do not reuse mammoth's
      original string. Splitting on `\n{2,}` and rejoining with a fixed `"\n\n"`
      changes length wherever three or more newlines ran together — the invariant
      breaks silently if you keep the original string and index into it.
- [ ] Table cells arrive as their own paragraphs, so table content gets spans for
      free. No special handling.
- [ ] `mammoth.convertToHtml` is the wrong tool here — it would need an HTML
      walker to recover offsets, and the extra structure buys nothing while every
      bbox is null.
- [ ] `method: "docx"`, `width: 0`, `height: 0`, no `label`, `source: "text"`.
- [ ] Keep the `"empty"` `ParsingError` for a document with no readable text.

### New: `api/src/features/parsing/parsers/xlsx.parser.ts`

**One page per sheet.** This is where the structural change pays off most.

- [ ] `assertOoxml`, then `XLSX.read(bytes, { type: "buffer" })`.
- [ ] One `ParsedPage` per name in `wb.SheetNames`, in that order. `label` is the
      sheet name. **Number `page` off the pages actually kept** (`pages.length + 1`),
      not the sheet index: `joinPages` marks pages by array position, so a skipped
      empty sheet would leave a gap and send every page hint to the wrong sheet.
- [ ] **Build each sheet's text cell by cell** — do not use `sheet_to_csv` for the
      text and then iterate cells separately for spans. The two disagree about
      quoting and blank runs, and the offsets silently stop lining up. Walk
      `XLSX.utils.decode_range(sheet["!ref"])`, and for each cell use
      `XLSX.utils.encode_cell({ r, c })` to get its address.
- [ ] Use `cell.w ?? String(cell.v)` — `w` is the *formatted* text Excel displays,
      which is what the user sees and therefore what the model will quote. `v` is
      the raw value and would make a currency or date quote unmatchable.
- [ ] Separate cells with `"\t"` and rows with `"\n"`. Tab over comma on purpose:
      no quoting rules to reason about, and it reads correctly in the viewer's
      `<pre>`.
- [ ] One span per non-empty cell, with `ref` set to its address.
- [ ] `sheet["!ref"]` is `undefined` on an empty sheet. Skip it, and push a warning
      rather than throwing — one blank tab in a workbook is not a failed parse.
- [ ] Cap rows per sheet (`MAX_SHEET_ROWS = 5000`) and warn when truncating, the
      way `OCR_PAGE_CAP` does. A 50k-row export would otherwise put megabytes into
      `spans_json` that `MAX_INPUT_CHARS` guarantees the model never reads.
- [ ] `method: "xlsx"`, `width: 0`, `height: 0`, `source: "text"`.
- [ ] `"empty"` `ParsingError` only when *every* sheet came back empty.

### New: `api/src/features/parsing/parsers/pptx.parser.ts`

**One page per slide.**

- [ ] `assertOoxml`, `readZip`, then match entries against
      `/^ppt\/slides\/slide(\d+)\.xml$/`.
- [ ] **Sort by the captured number, not by filename.** A string sort puts
      `slide10.xml` before `slide2.xml`, which silently reorders the deck and
      makes every page hint wrong past slide 9.
- [ ] Parse each slide with `xml2js` and walk it for `a:t` values, grouping by
      their enclosing `a:p` (paragraph) — one span per paragraph.
- [ ] **Use xml2js, not a regex over `<a:t>`.** Slide text carries XML entities
      (`&amp;`, `&#8217;`); a regex hands the model `&amp;` where the document says
      `&`, and the quote then fails to resolve for a reason nobody will guess.
- [ ] `label` is `"Slide N"` from the filename; `page` is numbered off the pages
      kept, so it stays in step with `joinPages` when a slide fails to parse.
- [ ] Known limitation, worth a comment: text-frame order in the XML is shape
      order, not necessarily reading order. Two-column slides can come out
      interleaved. Acceptable — the quote still resolves, and the highlight is
      still exact.
- [ ] Speaker notes (`ppt/notesSlides/`) are out of scope. Ignore them rather than
      appending them, or a quote will resolve to a note the reviewer cannot see.
- [ ] `method: "pptx"`, `width: 0`, `height: 0`, `source: "text"`.

### `api/src/features/parsing/parsers/image.parser.ts`

- [ ] Use the new `OcrImage` return plus `pageFromWords`.
- [ ] The box space is the image's own pixels, so the image's real dimensions are
      needed. Decode with `@napi-rs/canvas` rather than assuming — a JPEG carrying
      an EXIF orientation flag is the case that punishes a guess.
- [ ] Keep both `ParsingError`s: `"corrupt"` when OCR throws, `"empty"` when it
      returns nothing readable. With words instead of text, "empty" is
      `words.length === 0` or every word blank.
- [ ] `method: "image-ocr"`, one page, `width`/`height` = the image's pixels.

### `api/src/features/parsing/parsers/text.parser.ts`

- [ ] The only parser that keeps `normalizeWhiteSpace`. Call it **first**, then
      emit one span covering the whole normalized string, `bbox: null`.
- [ ] `width: 0`, `height: 0`. Nothing divides by them — every span here has
      `bbox: null` — and a fake page size invites something downstream to trust it.
- [ ] `method: "plain"` and the `"empty"` error are unchanged.

---

## Stage 5 — Storage

### `api/src/db/tenantDb.ts`

- [ ] Add to the `parsedDocumentText` DDL:

```sql
spans_json   TEXT NOT NULL DEFAULT '[]',
```

- [ ] Add to `extracted_values`:

```sql
source_span_ids TEXT,   -- JSON number[]
source_boxes    TEXT,   -- JSON NormalizedBox[]
```

Both nullable — a `match_kind: 'none'` field has neither, and neither does any
field on an office document.

### `api/src/features/extraction/sql/documentText.sql.ts`

- [ ] `upsert` takes `spans_json` as a new parameter and sets it in the
      `ON CONFLICT` branch alongside `pages_json`.
- [ ] **Split the read.** `getByDocumentId` is `SELECT *`, and
      [review.service.ts:44-46](../api/src/features/extraction/services/review.service.ts#L44-L46)
      uses it — so `spans_json` would ship to the browser on every review load.
      A 20-page PDF is ~20k spans, roughly 1MB of JSON, and the client no longer
      needs it now that the server resolves geometry.

```ts
// extraction only — includes spans_json
getByDocumentId: `SELECT * FROM parsedDocumentText WHERE document_id = ?;`,

// review payload — text and pages only
getPagesForReview: `
    SELECT document_id, text, pages_json, page_count, char_count, method, parsed_at
    FROM parsedDocumentText WHERE document_id = ?;
`,
```

### `api/src/features/extraction/models/extraction.model.ts`

- [ ] `DocumentText` gains `spans_json: string`.
- [ ] Add `PageSpans { page: number; width: number; height: number; spans: ParsedSpan[] }`
      — the shape stored in `spans_json`.
- [ ] `ReviewField` gains `source_span_ids: number[] | null` and
      `source_boxes: NormalizedBox[] | null`.
- [ ] `ReviewPage` becomes `{ page, source, text, label?: string }`. The label is
      the only addition — the text viewer slices on offsets and wants nothing else.

### `api/src/features/extraction/worker.ts`

- [ ] **Narrow `pages_json` at the write.** It is `JSON.stringify(parsed.pages)`
      today ([worker.ts:80](../api/src/features/extraction/worker.ts#L80)); once
      `ParsedPage` carries `spans`, that puts the megabyte straight back into the
      column the split above was meant to keep it out of.

```ts
const pagesJson = JSON.stringify(
  parsed.pages.map(({ page, text, source, label }) => ({ page, text, source, label })),
);
const spansJson = JSON.stringify(
  parsed.pages.map(({ page, width, height, spans }) => ({ page, width, height, spans })),
);
```

- [ ] Pass both to the upsert. Nothing else in the worker changes.

---

## Stage 6 — Binding the quote to geometry

### `api/src/features/extraction/utils/resolveQuote.util.ts`

The exact → normalized cascade is unchanged; one step is added after a hit.

- [ ] Grow the return type:

```ts
export interface QuoteLocation {
  page: number | null;
  start: number | null;
  end: number | null;
  spanIds: number[];       // stable identity, survives re-render
  boxes: NormalizedBox[];  // ready to draw, one per line
  matchKind: "exact" | "normalized" | "none";
  confidence: number;
}
```

Both are kept deliberately: the boxes are what the client draws today, the span
ids are what lets geometry be re-derived later without re-running the match. On
an office document `boxes` is always empty and `spanIds` is not — which is
exactly the case the frontend's `source_boxes === null` fallback exists for.

- [ ] Signature takes the page spans:
      `resolveQuote(quote, pages, hintedPage, spansByPage: Map<number, PageSpans>)`.
      Keep `NONE` as the miss, with `spanIds: []` and `boxes: []`.
- [ ] After a `[start, end)` hit on a page, collect every span where
      `span.start < end && span.end > start`. Those are `spanIds`.
- [ ] **Group into lines before unioning.** Spans are per-`TextItem`/per-word and
      several sit on one line, so a per-span union gives a rect per word and a
      whole-match union gives one tall box swallowing the right margin. Neither is
      what `HighlightOverlay` wants.

Walk the matched spans in span order, starting a new group when the current
span's vertical band does not overlap the group's by more than half:

```
overlap  = min(a.y1, b.y1) - max(a.y0, b.y0)
sameLine = overlap > 0.5 * min(a.y1 - a.y0, b.y1 - b.y0)
```

Union each group into one `NormalizedBox`. Spans with `bbox: null` are skipped
for geometry but still counted in `spanIds`, so office documents fall out of this
naturally with no special case.

- [ ] Accept the edge over-coverage: a quote starting mid-span highlights that
      whole span. For OCR that is at most a partial word; for a PDF it is one text
      item. Narrowing it means estimating character widths, which this design has
      already refused once.

### `api/src/features/extraction/sql/extractedValues.sql.ts`

- [ ] `upsert`: add `source_span_ids` and `source_boxes` to the column list, the
      `VALUES` placeholders (14 now), and the `ON CONFLICT DO UPDATE SET` list.
      The `review_status = 'unreviewed'` / `reviewed_at = NULL` reset stays.
- [ ] `getForReview`: select both new columns.
- [ ] `updateReviewedValue`: **no change, on purpose.** It touches only `value_*`,
      `review_status` and `reviewed_at`, so provenance already survives a review
      save. Add a comment saying that is deliberate — the next person reading it
      should not have to re-derive it.

Semantics worth writing down next to that comment: after a human edits a value,
the stored quote and boxes still describe **where the model looked**, not where
the corrected value came from. The UI keeps labelling that region as the model's
source.

### `api/src/features/extraction/services/extraction.service.ts`

- [ ] Parse `spans_json` beside the existing `pages_json` parse, into a
      `Map<number, PageSpans>` keyed by page number.
- [ ] Pass it to `resolveQuote`.
- [ ] Bind two more parameters on `upsert.run(...)`:
      `location.spanIds.length ? JSON.stringify(location.spanIds) : null`, and the
      same for `location.boxes`. Store `null`, not `"[]"` — the frontend
      distinguishes "no geometry" from "geometry that is empty" to pick its
      fallback path, and office documents depend on that distinction.
- [ ] `SYSTEM_PROMPT` is unchanged. The page markers still carry a number first;
      Stage 1 only appends a label in parentheses.

### `api/src/features/extraction/services/review.service.ts`

- [ ] Switch to `DOCUMENT_TEXT_SQL.getPagesForReview`.
- [ ] `ReviewFieldRow` gains both columns as `string | null`; `JSON.parse` each
      when non-null in the `fields.map`, exactly as `enum_options` is handled.
- [ ] Carry `label` through in the `pages.map` — it is currently
      `({ page, source, text })` and would drop it.

---

## Stage 7 — Frontend

The payoff: the client stops searching. Office rendering is unchanged by design;
the only office-facing edit is the page label.

### `frontend/src/types/index.ts`

- [ ] `export type NormalizedBox = [number, number, number, number];`
- [ ] `ReviewField` gains `source_boxes: NormalizedBox[] | null` and
      `source_span_ids: number[] | null`.
- [ ] `ReviewPage` gains `label?: string`.
- [ ] `ActiveQuote` gains `boxes: NormalizedBox[] | null`.

### `frontend/src/pages/ExtractedDocumentPage.tsx`

- [ ] `handleQuoteClick` copies `field.source_boxes` into the `ActiveQuote`.
      Nothing else on the page changes.

### `frontend/src/components/viewer/PdfPageLayer.tsx`

- [ ] When `activeQuote.boxes` is non-null and non-empty, multiply each normalized
      value by the rendered page element's size and hand the rects straight to
      `HighlightOverlay`. Report `onLocate(true)`.
- [ ] The `onRenderTextLayerSuccess` gating, the empty-spans guard and the
      `findBestRange` ladder all stay — they now only run on the fallback path.
- [ ] Measure against the rendered `.react-pdf__Page` element, not the wrapper.
      The wrapper is `width: fit-content` so they usually agree, but the page is
      what the coordinates were normalized to.
- [ ] The `ResizeObserver` recompute still applies — the rects are pixels even
      though their source is not.

### `frontend/src/components/viewer/ImageViewer.tsx`

- [ ] **Starts working.** Same normalized boxes times the rendered `<img>`'s size.
- [ ] Measure on the `<img>`'s `load` event, not on first render — before decode
      its `clientHeight` is 0 and every rect collapses.
- [ ] Delete the "Scanned pages carry no text coordinates yet" alert, and rewrite
      the component doc comment, which currently explains why this does not work.

### `frontend/src/components/viewer/TextViewer.tsx`

- [ ] Render `page.label` when present instead of `Page {page.page}` — "Q3
      Actuals", "Slide 4". Keep the number as a secondary caption so a page hint
      of 2 is still traceable to what the reviewer is looking at.
- [ ] The `locate()` cascade and the `<pre>` slicing are unchanged. A spreadsheet
      page is tab-separated, and `whiteSpace: "pre-wrap"` already renders that
      as columns.
- [ ] The `OCR` chip logic is unchanged — office pages are `source: "text"`.

### `frontend/src/utils/quoteSearch.ts`

- [ ] Keep it, demoted to the fallback for `source_boxes === null`. Do not delete
      it: office documents take this path permanently, a PDF whose text layer
      pdfjs renders differently in the browser than the server saw needs a
      recovery path, and so does every pre-Phase-5 row if a DB is ever restored.

### Unchanged

`HighlightOverlay` already takes a rect array. `SourceQuoteCell` and
`hasLocatableQuote` still key off `match_kind`. `DocumentViewerPanel`'s
`strategyFor` is unchanged — office still routes to `TextViewer`, which is the
decision this stage implements.

---

## Verification

Run in order — each one's failure explains the next one's.

**The invariant**

> Automated as three scripts during implementation (kept in the session
> scratchpad, not the repo): parser/`resolveQuote` checks against generated
> OOXML fixtures, an OCR-path check against a hand-built scanned PDF, and a
> baseline check against a hand-built text PDF with known coordinates. All pass.

- [ ] 1. Parse a text-layer PDF. Dump `spans_json` for page 1 and assert
      `page.text.slice(span.start, span.end) === <the item's own str>` for every
      span. **This is the invariant.** If it fails, nothing downstream can be
      trusted, and the boxes will look almost right.
- [ ] 2. Run the same assertion on a `.docx` and a `.xlsx`. The office parsers
      assemble their strings by hand, so they can break it independently of the
      PDF path — and with every bbox null, a broken office offset shows up only as
      a highlight on the wrong words in `TextViewer`.

**Geometry**

- [ ] 3. Every `bbox` value within `0..1`, with `x0 < x1` and `y0 < y1`.
      **In-range is not correct** — a box one line too high satisfies it. Check
      the baseline against arithmetic instead: put text at a known coordinate in
      a hand-built PDF and assert the box. For a 792pt page with an 18pt line
      whose baseline is at y=600 in PDF space, the box must be
      `y1 = (792-600)/792 = 0.2424` and `y0 = (792-600-18)/792 = 0.2197`.
      Reading `m[5]` as the top puts `y0` at 0.2424.
- [ ] 4. Extract, then check `extracted_values.source_boxes` is non-null for a
      field with `match_kind: "exact"` on a PDF.
- [ ] 5. Open the review page, click that field — the rectangle lands on the right
      words. Zoom in and out; it stays on them, since the coordinates are normalized.
- [ ] 6. A quote spanning a line break gives two or more rects, not one tall box
      across the margin.
- [ ] 7. A **scanned** PDF (forces `pdf-ocr`) and a **standalone image** of the
      same bitmap. Both highlight, and — the sharpest check available — their
      normalized boxes must come out **identical** despite different pixel
      dimensions. That is what scale-independence means, and a wrong denominator
      breaks it immediately.
- [ ] 7b. Parse a text PDF and *then* a scanned one in the same process. That is
      the worker's real pattern, and it is where a library conflict on the render
      path would surface.

**Office structure**

- [ ] 8. A multi-sheet `.xlsx`: `page_count` equals the sheet count, each
      `ReviewPage.label` is its sheet name, and `TextViewer` shows the sheets as
      separate panels.
- [ ] 9. A `.xlsx` with a currency or date column — the quote the model returns
      matches the *displayed* text. If it does not, `cell.v` is being read where
      `cell.w` was meant.
- [ ] 10. A `.pptx` with **more than nine slides**: slide 10 comes after slide 9,
      not after slide 1. This is the string-sort bug and it is invisible on a
      short deck.
- [ ] 11. A `.pptx` slide containing an `&` or a curly apostrophe — the parsed text
      shows the character, not `&amp;`.
- [ ] 12. A `.docx`: spans have `bbox: null`, `source_boxes` is null, `TextViewer`
      still marks the quote by offsets, and the PDF path's absent geometry throws
      nothing.
- [ ] 13. Rename a `.doc` to `.docx` and upload it — `assertOoxml` rejects it with
      the "Save it as .docx" message, not a stack trace.

**Regression**

- [ ] 14. Save a review with an edit, reload: `source_boxes` and `source_span_ids`
      unchanged.
- [ ] 15. Check the review payload size in the network tab against a 20-page PDF —
      it should not have grown. If it has, `pages_json` is still carrying spans.
- [ ] 16. `npx tsc --noEmit` in `api/`; `npx tsc -p tsconfig.app.json --noEmit` and
      `npx eslint src` in `frontend/`.

---

---

## What changed during implementation

Five things the plan had wrong. Each was found by a test, and each would have
been hard to spot by reading the code.

**1. `pdf-parse` is gone, not kept.** The plan kept it for `getScreenshot()` and
its error classification. In practice both libraries carry their own pdfjs and
fight over Node's `Path2D` global: a render that follows our own text pass throws
*"Value is non of these types `String`, `Path`"*. pdfjs rasterizes pages itself in
about fifteen lines, so `pdf-parse` was dropped outright — one PDF library, no
version skew, and the detached-buffer hazard disappears with the second consumer.

**2. Two dependencies must be pinned exactly.** `^5.4.296` on pdfjs pulls 5.7.x,
and pdf-parse's nested 5.4 API then meets the hoisted 5.7 worker — *"The API
version does not match the Worker version"*, aborting every render. `^0.1.80` on
`@napi-rs/canvas` pulls 0.1.100, whose Path2D pdfjs 5.4 rejects. Both are now
exact. Pinning pdfjs also let npm collapse the two copies into one.

**3. `standardFontDataUrl` is required, and the plan said it was not.** The
reasoning was that nothing renders — but the OCR path does. Without it pdfjs
warns to the console, **drops glyphs from the extracted text**, and renders the
rest wrong; a hybrid page OCRs to mangled words. Supplying it took the sample
PDF from 300 spans to 346. Give it as a plain filesystem path with forward
slashes: pdfjs asserts a trailing `"/"` that `path.sep` fails on Windows, and a
`file://` URL makes it report the font as unloadable.

**4. Whitespace-only text items must not get spans.** pdfjs emits `" "` items
between words — a third of all items on the sample PDF. Their text still has to
land in the page string, but a span for a space is noise in `spanIds` and widens
the line rect.

**5. `@types/mammoth` does not exist.** It 404s on npm. A local
`src/types/mammoth.d.ts` declaring `extractRawText` and `convertToHtml` is enough,
and `tsconfig`'s `include: ["src"]` picks it up with no config change.

Smaller corrections, folded into the stages above: page numbers on xlsx and pptx
are counted off the pages kept rather than the sheet/slide index, or a skipped
empty sheet desynchronises them from `joinPages`; `pageFromBlocks` needs a
per-block `breakBefore` because a spreadsheet has two separators; and a blank
cell must still emit its separator so columns do not shift left.

### Left as it was

The plan's two highest-risk calls both held up. `m[5]` is the baseline, and the
box maths is exact to four decimals against a hand-placed fixture
(`x0 = 120/612 = 0.1961`, `y1 = 192/792 = 0.2424`, `y0 = 174/792 = 0.2197`). And
the OCR denominator is the rendered bitmap, not the page box — proved by a
scanned PDF and a standalone image of the same bitmap resolving to identical
normalized rects from different pixel dimensions.

## Out of scope

- Rendering office originals in the browser, and the LibreOffice → PDF conversion
  that would be the right way to do it. See
  [Why office stays text](#why-office-stays-text).
- pptx speaker notes, and docx page breaks.
- Surfacing `ParsedSpan.ref` in the UI — the cell address is stored this phase,
  displayed in a later one.
- Re-parse-avoidance on retry — the worker still re-parses a requeued job from
  scratch, OCR included.
- `pdf-parse`'s `getTable()` structure extraction — different feature.
- Letting the reviewer draw a correction box. This stores model provenance only.
- Chunking/indexing consuming spans — next phase, and this shape is what it reads.
