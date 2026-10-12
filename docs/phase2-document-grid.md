# Build guide — Document Grid page

Target: `/documents` shows every uploaded document, with delete. Backend is done;
this is frontend-only.

## What already exists

| Piece                                                                        | Status                       |
| ---------------------------------------------------------------------------- | ---------------------------- |
| `GET /api/documents` (joined, sorted)                                        | done                         |
| `DELETE /api/documents/:id` → 204                                            | done                         |
| `api/documents.ts` client fns                                                | done                         |
| `documentStore` (`documents`, `loading`, `fetchDocuments`, `removeDocument`) | done, needs an `error` field |
| `formatBytes` in `utils/format.ts`                                           | done, reuse it               |
| `DocumentGridPage`                                                           | stub — `<h1>Documents</h1>`  |

## The row shape you're rendering

`DocumentListItem` (`src/types/index.ts`) — every field the grid can show:

```ts
id           number
schema_id    number
filename     string   // original upload name, safe to display
mime_type    string
storage_path string   // ⚠️ server-internal — do NOT render (see gotchas)
size_bytes   number   // → formatBytes()
status       "uploaded" | "processing" | "extracted" | "failed"
uploaded_at  string    // "2026-08-10 19:10:03", UTC, space-separated
schema_name  string    // from the JOIN
```

---

## Stage 1 — `src/stores/documentStore.ts`

The grid needs to tell "request failed" apart from "no documents yet". Right now
`fetchDocuments` swallows the error into `console.error` and leaves `documents`
at `[]`, so both render identically.

- [x] Add `error: string | null` to `DocumentState` and the initial state.
- [x] In `fetchDocuments`: clear the error on entry, set it in `catch`.
      Use `error instanceof ApiError ? error.message : "Failed to load documents"`
      — same shape as `UploadPage.uploadOne`.
- [x] Leave `removeDocument` throwing. The page shows a snackbar; the store
      shouldn't own transient UI state.

Resulting signature:

```ts
interface DocumentState {
  documents: DocumentListItem[];
  loading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  addDocument: (file: File, schemaId: number) => Promise<void>;
  removeDocument: (id: number) => Promise<void>;
}
```

---

## Stage 2 — `src/utils/format.ts`

- [x] Add `formatDateTime(value: string): string`.

Gotcha: SQLite writes `datetime('now')` as `"2026-08-10 19:10:03"` — UTC, with a
space, no timezone marker. `new Date("2026-08-10 19:10:03")` parses it as _local_
time in every browser, so timestamps drift by your UTC offset. Normalize first:

```ts
// "2026-08-10 19:10:03" -> "2026-08-10T19:10:03Z"
const iso = value.replace(" ", "T") + "Z";
```

Then `toLocaleString()`. Worth a comment — this will bite again on the query page.

---

## Stage 3 — `src/components/DocumentStatusChip.tsx`

Small and reusable; the query page will want it too.

```tsx
interface DocumentStatusChipProps {
  status: DocumentStatus;
}
```

- [x] Map status → `{ label, color }` in a `const … as const` lookup, same
      pattern as `STATUS_CHIP` in `UploadQueueItem.tsx`.
- [x] Suggested: uploaded → `default`, processing → `info`,
      extracted → `success`, failed → `error`.

Heads-up: **every row will say "uploaded" right now.** `createDocument` inserts
an `extraction_jobs` row with status `queued`, but nothing consumes that queue
yet, so `documents.status` never advances. That's expected, not a bug — don't go
hunting for it. No polling needed until a worker exists.

---

## Stage 4 — `src/components/RenderDocuments.tsx`

Presentational only — no store access, no fetching. Mirrors `RenderSchemas`.

```tsx
interface RenderDocumentsProps {
  documents: DocumentListItem[];
  onDelete: (document: DocumentListItem) => void;
}
```

- [ ] Empty state: outlined `Paper`, centered, pointing at `/upload`.
      Copy the shape from `RenderSchemas.tsx:21-29`.
- [ ] Table via `TableContainer` + `Table size="small"`, wrapped in
      `<Box sx={{ overflowX: "auto" }}>` with `sx={{ minWidth: … }}` on the
      Table — same as `RenderSchemaGrid.tsx:91-93`.
- [ ] Columns: Name · Schema · Size · Status · Uploaded · (delete icon).
- [ ] Header cells use `sx={{ fontWeight: 700 }}`.
- [ ] Filename cell: `noWrap` + `sx={{ maxWidth: 280 }}`. Real filenames are long
      and will blow out the table.
- [ ] Hide Size and Uploaded on mobile:
      `sx={{ display: { xs: "none", sm: "table-cell" } }}`.
- [ ] Pass the whole `document` to `onDelete`, not just the id — the confirm
      dialog needs the filename.

**Do not render `storage_path`.** It's the server's on-disk layout
(`user_5/056b3c9b-….pdf`). It's in the payload only because the list query is
`SELECT documents.*`. Showing it leaks internal structure and means nothing to a
user. Same for `mime_type` unless you want a file-type icon.

**Do not re-sort.** `DOCUMENT_SQL.getDocuments` already orders by
`uploaded_at DESC, id DESC`. Sorting again client-side will fight the server.

---

## Stage 5 — `src/components/ConfirmDialog.tsx`

Deleting is irreversible — it drops the row, its jobs, and unlinks the file.

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}
```

- [ ] MUI `Dialog` + `DialogTitle` / `DialogContent` / `DialogActions`.
- [ ] Confirm button `color="error"`.

Keep it generic — `RenderSchemas` currently deletes a whole schema (cascading to
its columns) with no confirmation at all. Once this exists, retrofitting it there
is a two-line change.

---

## Stage 6 — `src/pages/DocumentGridPage.tsx`

Page owns state and data-fetching; `RenderDocuments` owns the JSX.

- [ ] Select from the store one field per call, the way `SchemaBuilderPage` does
      — `useDocumentStore((s) => s.documents)` etc. A single selector returning
      an object gives you a new reference every render and re-renders forever.
- [ ] `useEffect(() => { fetchDocuments(); }, [])` on mount.
- [ ] Local state: `pendingDelete: DocumentListItem | null`, `deleteError: string | null`.
- [ ] Render order: `loading && documents.length === 0` → `<CircularProgress />`;
      `error` → `<Alert severity="error">` with a Retry button calling
      `fetchDocuments`; otherwise `<RenderDocuments />`.
      Gate the spinner on `documents.length === 0` so a refetch after delete
      doesn't blank the table.
- [ ] `handleConfirmDelete` — `await removeDocument(id)` in a try/catch, clear
      `pendingDelete` in `finally`, surface failures via `Snackbar`.
- [ ] Header row: `Documents` title + count, matching `SchemaBuilderPage.tsx:20-36`.

---

## Conventions to hold to

- `.then()` always gets an explicit arrow: `.then((data) => setX(data))`, never
  `.then(setX)`. (CLAUDE.md)
- MUI v9: layout props go in `sx` — `alignItems`, `justifyContent`, `fontWeight`.
  Passing `alignItems` directly to `Stack` is a type error; that's what broke
  `FileDropZone` on the first type-check.
- Keep components small. If `RenderDocuments` passes ~120 lines, split the row
  into `DocumentRow.tsx`.

## Out of scope

- **Download button.** There's no `GET /documents/:id/download` route despite
  commit `01290e9` being titled "download endpoint" — `routes/documents.ts` only
  registers POST `/`, GET `/`, GET `/:id`, DELETE `/:id`. That endpoint needs to
  land before the frontend can link to it. Separate task.
- Pagination, filtering by schema, bulk delete.

## Verify when done

```bash
cd frontend && npx tsc -b && npm run lint
```

`vite.config.ts(8,7)` babel error and the 4 errors in `SchemaDetailPage` /
`schemaStore` are pre-existing — ignore those, just don't add new ones.

Log in as the user owning `user_5.sqlite`: it has 2 real documents, so the grid
should render two rows immediately.
