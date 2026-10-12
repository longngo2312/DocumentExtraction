# Build guide — UI/UX overhaul

Target: warm-canvas visual direction, left sidebar shell, profile surface, light +
dark modes, a real `/query` chat UI, and an accessibility pass. Frontend-only —
no API changes, no new dependencies.

Companion plan (decisions + rationale): `C:\Users\Crack\.claude\plans\current-task-ui-ux-overhaul-jazzy-karp.md`

## What already exists

| Piece | Status |
| --- | --- |
| `theme.ts` — navy/slate palette, 7 component overrides | exists, needs rewrite |
| `"Inter"` in `typography.fontFamily` | **never loaded** — no dep, no `<link>`, no `@import`. Everyone is on Segoe UI |
| `colorSchemes: { light: true, dark: false }` + `defaultMode="system"` | dead code — a mode prop with no dark scheme to switch to |
| `Layout.tsx` — horizontal `AppBar`, 4 nav `Button`s | exists, replaced by the sidebar |
| Brand mark (48px navy square + `DescriptionOutlinedIcon`) | exists, but buried inside `AuthLayout.tsx` — extract it |
| `authStore.user` = `{ id, username, email }` | `email` is stored and **never rendered** |
| `documentStore` `loading` / `error` | maintained, rendered by nothing — live `TODO(wiring)` in `DocumentGridPage` |
| `QueryPage.tsx` | 5-line stub: `return <h1>Query</h1>;` |
| `upload/` + `auth/` folders | already theme-clean (no hex) — they re-skin for free |
| `extraction/` + `viewer/` folders | carry ~35 hardcoded hex literals — must be de-hexed before dark mode works |
| `@mui/icons-material` | already a dep — no new icon library needed |

## Two constraints to hold onto

1. **Dark mode is gated on the de-hex sweep (Stage 7).** A literal `#F1F5F9` cannot
   respond to a color scheme. Stage 7 isn't tidying — it's what makes Stage 2's dark
   palette actually reach the screen. Expect dark mode to look broken until it lands.
2. **The document viewer pane stays light in both schemes.** `HighlightOverlay.tsx`
   uses `mixBlendMode: "multiply"`, which produces no visible highlight over a dark
   surface — and scanned pages are white paper regardless. It gets `surface.viewer`,
   the one token that does *not* flip.

---

## Stage 1 — `frontend/index.html`

The font fix. A `<link>` does what `@fontsource` would add a dependency for.

- [ ] Add inside `<head>`, after the viewport meta:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap"
/>
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F5" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1A1917" />
```

- [ ] Add the no-flash script as the **last** thing in `<head>` (see gotcha below):

```html
<script>
  (function () {
    try {
      var mode = localStorage.getItem("mui-mode") || "system";
      var dark =
        mode === "dark" ||
        (mode === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute(
        "data-mui-color-scheme",
        dark ? "dark" : "light"
      );
    } catch (e) {}
  })();
</script>
```

**Gotcha — verify the attribute name before trusting this script.** MUI's
`InitColorSchemeScript` is built for SSR; in a CSR Vite app it's simpler to inline
the above. But the storage key and attribute must match exactly what MUI writes.
After Stage 2 lands, toggle the theme and inspect `<html>` in DevTools: confirm it's
`data-mui-color-scheme="dark"` and that `localStorage` holds `mui-mode`. If MUI uses
different names in v9, fix the script to match — a mismatch doesn't error, it just
silently keeps the flash.

---

## Stage 2 — `frontend/src/theme.ts` (rewrite)

The largest single piece of the overhaul. Structure:

```ts
import { createTheme, type Theme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    surface: {
      sunken: string;
      viewer: string;
      activeRow: string;
      pendingRow: string;
    };
  }
  interface PaletteOptions {
    surface?: Partial<Palette["surface"]>;
  }
}

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: {
    light: { palette: { /* table below */ } },
    dark: { palette: { /* table below */ } },
  },
  typography: { /* Stage 2c */ },
  shape: { borderRadius: 8 },
  shadows: [ /* Stage 2d */ ],
  components: { /* Stage 2e */ },
});

export default theme;
```

### 2a — Light palette

- [ ] Fill in `colorSchemes.light.palette`:

| Path | Value | Notes |
| --- | --- | --- |
| `background.default` | `#FAF9F5` | warm cream canvas |
| `background.paper` | `#FFFFFF` | cards, drawers, menus |
| `surface.sunken` | `#F2F0EA` | table heads, empty states, sidebar ground |
| `surface.viewer` | `#F1F0EC` | document pane — **same value in dark** |
| `surface.activeRow` | `#EFF3F9` | selected / active-quote row wash |
| `surface.pendingRow` | `#FBF6EC` | unreviewed amber wash |
| `text.primary` | `#1F1E1C` | warm near-black |
| `text.secondary` | `#6B6A65` | warm gray |
| `text.disabled` | `#8F8D86` | |
| `divider` | `#E4E1D9` | warm border |
| `primary` | main `#1E3A5F`, light `#2E5A8F`, dark `#0F1F35`, contrastText `#FFFFFF` | navy, unchanged |
| `secondary` / `success` / `warning` / `error` / `info` | **copy from the current `theme.ts` unchanged** | these carry meaning in the review UI — don't retune them |

### 2b — Dark palette

- [ ] Fill in `colorSchemes.dark.palette`. Note `mode: "dark"` is implied by the key.

| Path | Value | Notes |
| --- | --- | --- |
| `background.default` | `#1A1917` | warm near-black, not blue-black |
| `background.paper` | `#232220` | |
| `surface.sunken` | `#141312` | sunken goes *darker* than the canvas here — the light-mode relationship inverts |
| `surface.viewer` | `#F1F0EC` | **unchanged — constraint 2** |
| `surface.activeRow` | `#1E2A3A` | |
| `surface.pendingRow` | `#2A2418` | |
| `text.primary` | `#EDEBE5` | |
| `text.secondary` | `#A3A099` | |
| `divider` | `#35332F` | |
| `primary.main` | `#7FA9D9` | **navy is unreadable on dark — the primary must lighten.** `#1E3A5F` on `#1A1917` is ~1.3:1 |
| `secondary.main` | `#60A5FA` | |
| `success.main` | `#34D399` | |
| `warning.main` | `#FBBF24` | |
| `error.main` | `#F87171` | |

Contrast, computed against these exact pairs (WCAG AA body text needs 4.5:1):

| Pair | Ratio |
| --- | --- |
| `#6B6A65` on `#FAF9F5` (light secondary text) | **5.14:1** ✓ |
| `#1E3A5F` on `#FAF9F5` (light primary) | **10.9:1** ✓ |
| `#A3A099` on `#1A1917` (dark secondary text) | **6.63:1** ✓ |
| `#7FA9D9` on `#1A1917` (dark primary) | **7.1:1** ✓ |

If you change any of these four values, recompute — don't eyeball it. The warm grays
on cream are the pair with the least headroom.

### 2c — Typography

- [ ] `fontFamily: '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif'`
- [ ] Add `h1`–`h4`, each with
      `fontFamily: '"Space Grotesk", "DM Sans", sans-serif'`, `fontWeight: 600`,
      `letterSpacing: "-0.02em"`.
- [ ] Give `h4` a real weight so pages stop bolting `sx={{ fontWeight: "bold" }}` onto
      `variant="h4"` — that pattern is in 3 pages today and all 3 should shed it.
- [ ] Keep the existing `subtitle1` / `subtitle2` / `body2` / `caption` overrides.
- [ ] Add an `overline` variant sized `0.6rem`, weight 600, uppercase,
      `letterSpacing: "0.08em"` — this is the single destination for the ~12 scattered
      `fontSize: "0.6rem"` literals that Stage 7 removes.

### 2d — Shadows

- [ ] Override `shadows[1]`, `[2]`, `[3]` with soft-UI values. These replace the three
      hand-rolled `box-shadow` strings in `ExtractedDocumentPage.tsx`,
      `ExtractedValueRowItem.tsx`, and `ExtractionSummary.tsx`.

Gotcha: `shadows` must be a 25-element array. Spread the default and patch indices
rather than writing a short literal, or MUI throws at any `elevation` above your
array length:

```ts
const base = createTheme().shadows;
const shadows = [...base] as Theme["shadows"];
shadows[1] = "0 1px 2px rgba(31,30,28,0.05), 0 1px 3px rgba(31,30,28,0.04)";
shadows[2] = "0 2px 4px rgba(31,30,28,0.06), 0 4px 8px rgba(31,30,28,0.04)";
shadows[3] = "0 4px 8px rgba(31,30,28,0.07), 0 8px 16px rgba(31,30,28,0.05)";
```

### 2e — Component overrides

Every override in the current file hardcodes hex that breaks in dark. Convert each to
a `theme.vars.palette.*` reference using the callback form:

```ts
MuiTableHead: {
  styleOverrides: {
    root: ({ theme }) => ({
      "& .MuiTableCell-head": {
        backgroundColor: theme.vars.palette.surface.sunken,
        color: theme.vars.palette.text.secondary,
        borderBottom: `2px solid ${theme.vars.palette.divider}`,
        // ...keep the existing font rules
      },
    }),
  },
},
```

- [ ] `MuiTableHead` — `#F1F5F9` → `surface.sunken`, `#475569` → `text.secondary`,
      `#E2E8F0` → `divider`
- [ ] `MuiTableCell` — `#F1F5F9` border → `divider`
- [ ] `MuiTableRow` — `#F8FAFC` hover → `action.hover`; `#EFF6FF` / `#DBEAFE` selected
      → `surface.activeRow`
- [ ] `MuiLinearProgress` — `backgroundColor: "#E2E8F0"` → `divider`. This one is
      actively broken in dark: a light-gray track on a near-black card.
- [ ] `MuiPaper.outlined` — `#E2E8F0` → `divider`
- [ ] `MuiChip`, `MuiButton`, `MuiIconButton` — keep as-is (no hex in them)
- [ ] **New** `MuiCssBaseline`:

```ts
MuiCssBaseline: {
  styleOverrides: (theme) => ({
    ":focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2,
    },
    "@media (prefers-reduced-motion: reduce)": {
      "*, *::before, *::after": {
        animationDuration: "0.01ms !important",
        animationIterationCount: "1 !important",
        transitionDuration: "0.01ms !important",
      },
    },
  }),
},
```

That reduced-motion block is what makes `HighlightOverlay`'s pulse keyframes
compliant — no change needed in that file.

**Gotcha — `theme.vars` is only populated when `cssVariables` is on.** If you see
`Cannot read properties of undefined (reading 'palette')` at render, `cssVariables`
didn't take. Verify the exact option shape against the MUI v9 docs for the installed
version (`@mui/material@^9.4.0`) before debugging further — this API moved between v5
and v6.

---

## Stage 3 — `frontend/src/main.tsx`

- [ ] `defaultMode="system"` is now valid (a dark scheme exists). Leave it.
- [ ] No `InitColorSchemeScript` — the Stage 1 inline script covers CSR.
- [ ] Leave `index.css` at its 5 lines. The reset belongs in `CssBaseline`.

**Checkpoint before continuing.** Run `npm run dev`. The app should render in DM Sans
on a cream canvas with the old layout still in place. Dark mode will look half-broken
— that's expected until Stage 7. Do not start Stage 4 until `npm run build` passes;
the module augmentation is the likeliest thing to be wrong and it's much easier to
find now than after 12 more files.

---

## Stage 4 — Shell components (`src/components/layout/`)

Six new files. Build them in this order — each is used by the next.

### 4a — `Brand.tsx`

- [ ] Extract the mark that already exists inside `AuthLayout.tsx` (48px navy rounded
      square + `DescriptionOutlinedIcon`).
- [ ] Props: `size?: number` (default 32), `showWordmark?: boolean` (default true).
- [ ] **Then edit `AuthLayout.tsx` to import it.** The point is one brand mark, not
      two that drift apart.

### 4b — `ThemeModeToggle.tsx`

```ts
import { useColorScheme } from "@mui/material/styles";
const { mode, setMode } = useColorScheme();
```

- [ ] Three-way: light / dark / system. A `ToggleButtonGroup` reads clearest.
- [ ] `mode` is `undefined` on the first render before hydration — render nothing (or
      a skeleton) rather than defaulting to `"light"`, or the control visibly jumps.
- [ ] **Do not hand-roll localStorage.** MUI persists `mode` itself; a second writer
      fights the Stage 1 script.

### 4c — `NavItem.tsx`

- [ ] Props: `{ to, label, icon, collapsed }`.
- [ ] `component={NavLink}` — active styling via `"&.active"`, as the current
      `Layout.tsx` does.
- [ ] Active state: `surface.activeRow` background + a 3px `primary.main` leading bar
      + weight 600. Not the current `fontWeight: "bold"` alone, which is nearly
      invisible.
- [ ] When `collapsed`, render icon-only wrapped in a `Tooltip` with the label —
      and keep `aria-label={label}` on the link regardless, because a tooltip title
      does not reliably announce.
- [ ] Min height 44px (touch target).

### 4d — `AppSidebar.tsx`

- [ ] Layout: `Brand` → `NavItem` list → `<Box sx={{ flexGrow: 1 }} />` → `ProfileMenu`.
- [ ] Widths: 240 expanded, 72 collapsed. Define both as module constants and export
      them — `Layout.tsx` needs the same numbers for its content offset.
- [ ] Nav config (icons all from `@mui/icons-material`):

```ts
const links = [
  { to: "/schemas",   label: "Schemas",   icon: <SchemaOutlinedIcon /> },
  { to: "/upload",    label: "Upload",    icon: <UploadFileOutlinedIcon /> },
  { to: "/documents", label: "Documents", icon: <DescriptionOutlinedIcon /> },
  { to: "/query",     label: "Query",     icon: <ChatBubbleOutlineIcon /> },
];
```

- [ ] Collapse toggle button at the bottom, with `aria-label` and
      `aria-expanded={!collapsed}`.

### 4e — `ProfileMenu.tsx`

- [ ] Trigger: avatar + username (hide the username when the rail is collapsed).
- [ ] `Menu` contents: username, **email** (`authStore` has it and nothing shows it
      today), divider, `ThemeModeToggle`, "Account" → `/profile`, "Sign out".
- [ ] Move the existing logout handler here verbatim from `Layout.tsx` — the
      `await logout()` before `navigate("/login")` matters, the comment explains why
      (the refresh token must be revoked before the page unmounts).
- [ ] `aria-label="Log out"` on the sign-out item.

### 4f — `PageShell.tsx`

- [ ] Props: `{ title: string; subtitle?: string; actions?: ReactNode; maxWidth?: Breakpoint | false; children }`.
- [ ] Renders `Container` + a header row (`h4` title, optional subtitle, `actions`
      right-aligned) + children.
- [ ] Header row must wrap under `sm` — `flexDirection: { xs: "column", sm: "row" }`,
      `alignItems: { xs: "flex-start", sm: "center" }`.

This one is deduplication, not speculation: `SchemaBuilderPage`, `UploadPage`, and
`DocumentGridPage` each hand-roll the identical `Container` + `h4` + flex-row-with-
button header today. Three existing call sites, day one.

---

## Stage 5 — `Layout.tsx` (rewrite)

- [ ] `md` and up: permanent `Drawer` + content region offset by the sidebar width.
- [ ] Under `md`: slim `AppBar` (hamburger + `Brand` + `ProfileMenu`) driving a
      temporary `Drawer`. **Close the drawer on route change** — `useEffect` on
      `useLocation().pathname`. Forgetting this leaves the drawer covering the page
      the user just navigated to on every mobile tap.
- [ ] Persist `collapsed` to `localStorage` under `sidebarCollapsed`.
- [ ] Skip link as the first focusable element:

```tsx
<Box component="a" href="#main" sx={{
  position: "absolute", left: -9999, top: 0, zIndex: 9999,
  "&:focus": { left: 8, top: 8, p: 1, bgcolor: "background.paper" },
}}>Skip to content</Box>
```

- [ ] **Drop the `Container`.** Today `Layout` wraps in `Container maxWidth="lg"`
      (`py: 3`) *and* every page nests its own `Container maxWidth="md"` (`py: 4`) —
      content is constrained and padded twice, which is a real part of why the pages
      feel cramped. `Layout` now renders a plain
      `<Box component="main" id="main" sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>`.
      Width comes from `PageShell` instead.
- [ ] Keep the column-flex behaviour — `ExtractedDocumentPage` depends on it to fill
      the viewport.

---

## Stage 6 — Profile page + missing routes

### `src/pages/ProfilePage.tsx` (new)

- [ ] Identity card: large avatar, username, email, account id — that's the whole of
      `authStore.user`.
- [ ] Appearance section: `ThemeModeToggle`.
- [ ] Sign out.
- [ ] **No password-change control.** There is no endpoint for it; a dead control is
      worse than an absent one. Same for avatar upload.

### `src/pages/NotFoundPage.tsx` (new)

- [ ] `PageShell` + message + "Back to Schemas".

### `src/router/AppRouter.tsx`

- [ ] Add `/profile` inside `ProtectedRoute`.
- [ ] Add `<Route path="*" element={<NotFoundPage />} />` — an unknown path currently
      renders a completely blank page.

---

## Stage 7 — De-hex sweep (**this is what turns dark mode on**)

Mechanical, file by file. Ordered by literal count.

- [ ] `extraction/ExtractedValueRowItem.tsx` — 267 lines, 9 hex, 17 `sx`. The worst
      offender.
  - `active ? "#EFF6FF" : pending ? "#FFFBEB" : "background.paper"` →
    `surface.activeRow` / `surface.pendingRow`
  - `STATUS_BORDER_COLOR` / `FLAG_BORDER_COLOR` maps → palette path strings
  - hand-rolled shadow → `theme.shadows[1]`
  - while you're in here: the two duplicated 9-line "Value"/"Source" caption blocks
    → one local `FieldLabel`; lift the row body into a new
    `extraction/ExtractedValueRowBody.tsx`. Target under ~150 lines.
- [ ] `viewer/ViewerToolbar.tsx` — 6 hex. `#F8FAFC` → `surface.sunken`,
      `#CBD5E1`/`#E2E8F0` → `divider`, hover fills → `action.hover`.
- [ ] `extraction/ReviewActions.tsx` — 5 hex. Three near-identical 25-line
      `IconButton` blocks differing only in color → one `ReviewActionButton` mapped
      over a config array.
- [ ] `extraction/InferenceNote.tsx` — 4 hex. `BAND_COLOR` → `success.main` /
      `warning.main` / `error.main`.
- [ ] `extraction/SummaryTab.tsx` (3), `extraction/SourceQuoteCell.tsx` (2).
- [ ] `layout/SplitPane.tsx` — `bgcolor: "#F1F5F9"` → `surface.viewer`.
- [ ] `extraction/ExtractedValuesTable.tsx`, `extraction/ExtractedValueCell.tsx`,
      `pages/ExtractedDocumentPage.tsx` — remaining singles + the hand-rolled shadow.
- [ ] `extraction/SummarySection.tsx` — takes `accent` as a **raw hex prop**
      (`accent="#2563EB"`). Change the prop to a palette path (`accent="secondary.main"`)
      so callers can't reintroduce hex through the back door.
- [ ] Same pass on the 29 hardcoded `fontSize` strings → `variant="caption"` /
      `variant="overline"` (added in Stage 2c).

**Gate:** this returns nothing when the stage is done —

```bash
grep -rE "#[0-9A-Fa-f]{6}" frontend/src --include=*.tsx
```

Then re-test dark mode. It should now be correct everywhere except the viewer pane,
which stays light on purpose.

---

## Stage 8 — Page polish

- [ ] **`SchemaBuilderPage` + `RenderSchemas`** — adopt `PageShell`; rows → responsive
      card grid. Rows are `onClick` `<div>`s today and **keyboard users cannot reach
      them** — change to `CardActionArea component={RouterLink}`. `aria-label` on the
      delete button (keep the existing `stopPropagation`). Render the store's
      `loading` as skeleton cards; the page ignores it today.
- [ ] **`SchemaDetailPage` + `RenderSchemaGrid`** — the header currently lives inside
      `RenderSchemaGrid`; move it to the page via `PageShell` so the render component
      only renders the table. `scope="col"` on head cells; stack under `sm`.
- [ ] **`SchemaBuilder.tsx`** (364 lines, largest file) — extract
      `schema/ColumnDraftCard.tsx`. `Stack spacing={5}` → `3`. Replace `key={index}`
      with a stable per-draft id (deleting mid-list currently remounts the wrong
      rows — a real bug, not just a lint nit). Replace the `setTimeout(…, 50)` focus
      hack with a ref callback on the new card.
- [ ] **`UploadPage` + `upload/`** — already hex-free, re-skins for free. Add
      `aria-live="polite"` on the queue region and a page-level error summary. Keep
      the sequential upload loop.
- [ ] **`DocumentGridPage` + `RenderDocuments`** — `PageShell`; **resolve the live
      `TODO(wiring)`**: the store exposes `loading` and `error` and the page renders
      neither. Skeleton rows + an error `Alert` with retry. `aria-label` on delete.
      The empty state is already good — leave it.
- [ ] **`ExtractedDocumentPage` + `extraction/`** — the densest UI, and it has **zero
      breakpoints**. `ExtractedValueRowItem`'s Value/Source two-column body must stack
      under `sm`. `ExtractionSummary` (18 `sx`) gets a header that wraps.

---

## Stage 9 — `/query` chat UI (mock-backed)

### `src/api/query.ts` (new)

Pin the contract first, then mock it. Citations reuse `NormalizedBox` and mirror
`ActiveQuote`, so a citation can drive the **existing** `HighlightOverlay` with no new
highlight code:

```ts
import type { NormalizedBox } from "../types";

export interface QueryCitation {
  document_id: number;
  filename: string;
  page: number;
  quote: string;
  boxes: NormalizedBox[] | null; // null → viewer falls back to utils/quoteSearch.ts
}

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: QueryCitation[];
}

// TODO(RAG): swap the body for
//   apiFetch<QueryMessage>("/query", { method: "POST", body: JSON.stringify({ question }) })
// Backend target: POST /api/query { question, document_ids? }
//                 -> { id, answer, citations, model }
export async function askQuery(
  question: string,
  history: QueryMessage[]
): Promise<QueryMessage> { /* mock */ }
```

- [ ] Keep this signature identical to the eventual real call so the swap is a
      one-line body change.
- [ ] Mock should delay ~800ms and return 1–2 citations pointing at a real uploaded
      document id, so the deep-link path is actually exercised.

### `src/components/query/` (new)

- [ ] `ChatMessageList.tsx` — scrollback, auto-scroll to bottom, `aria-live="polite"`
      on the assistant region.
- [ ] `ChatMessage.tsx` — user turn right-aligned and tinted; assistant turn
      full-width on the canvas (Claude-style, not a bubble per side).
- [ ] `ChatComposer.tsx` — multiline `TextField`; Enter sends, Shift+Enter newlines;
      send button ≥44×44px; disabled + spinner while pending.
- [ ] `CitationChip.tsx` — `[1]` marker → hover card (filename, page, quote); click
      navigates to `/documents/:id` with the quote in router state.
- [ ] `SourcesList.tsx` — per-answer collapsible source list.
- [ ] `EmptyChatState.tsx` — `Brand` + 3–4 example questions as clickable chips.

### `src/pages/QueryPage.tsx` (replaces the 5-line stub)

- [ ] Full-height flex column — message list scrolls, composer pinned to the bottom.
- [ ] Owns `messages` + `pending`. `PageShell maxWidth={false}`.

### `src/pages/ExtractedDocumentPage.tsx`

- [ ] Read an incoming `ActiveQuote` from `useLocation().state` on mount, so a
      citation deep-link lands on the highlighted quote instead of the top of the doc.

---

## Stage 10 — Accessibility & responsive pass

- [ ] `aria-label` on every icon-only button. Full audit: `RenderSchemas` delete,
      `RenderDocuments` delete, `ViewerToolbar` zoom in/out/reset, `ReviewActions`
      accept/edit/reject, sign-out. A `Tooltip` title does not reliably announce.
- [ ] Any `onClick` on a non-interactive element → `ButtonBase` / `CardActionArea` /
      `component={RouterLink}`.
- [ ] Touch targets ≥44×44px. MUI `size="small"` `IconButton` is 34px — bump to
      `medium` or pad.
- [ ] `aria-live` on: upload queue status, review save result, chat responses.
- [ ] `scope="col"` on table head cells in `RenderDocuments` and `RenderSchemaGrid`.
- [ ] Breakpoint sweep at 375 / 768 / 1024 / 1440. `extraction/` is the gap.

---

## Verification

Both servers per `CLAUDE.md` — API `npm run dev` (3000), frontend `npm run dev` (5173).

1. `npm run build` in `frontend/` — `tsc -b` passes. The palette module augmentation
   is the likely failure point; a squiggle on `bgcolor: "surface.sunken"` means the
   `declare module` block is wrong.
2. `npm run lint` clean.
3. **Font actually loads** — DevTools › Network, filter `font`: DM Sans and Space
   Grotesk both present. Computed `font-family` on `<body>` is DM Sans, not Segoe UI.
   This regression has been invisible since the theme was written.
4. **No theme flash** — hard-reload in dark mode. No white flash before paint. If
   there is one, the Stage 1 script's key/attribute don't match MUI's.
5. **Dark mode walk** — `/schemas → /upload → /documents → /documents/:id → /query →
   /profile`. Nothing washes out; the viewer pane stays light and quote highlights
   are still visible.
6. `grep -rE "#[0-9A-Fa-f]{6}" frontend/src --include=*.tsx` returns nothing.
7. **Keyboard-only pass** — Tab from load: skip link fires first, every nav item
   reachable, schema cards open on Enter, accept/edit/reject reachable, focus ring
   always visible.
8. **Responsive** — 375 / 768 / 1024 / 1440. Sidebar → drawer under `md`; no
   horizontal scroll except the intentional `overflowX: "auto"` table containers.
9. **Screen reader spot-check** (NVDA or Narrator) on `/documents/:id` — the review
   actions announce their purpose, not "button".
10. **End-to-end regression** — register → create schema → upload a PDF → wait for
    `extracted` → review every field → Save. The save gate (`decided < total` disables
    Save) must still behave. Stage 7 touches those components heavily, so this is the
    run that catches a bad find-and-replace.
11. **`/query`** — mock answers render; a citation chip navigates to `/documents/:id`
    and the quote is highlighted.

## Notes

- **No new dependencies.** Fonts via `<link>`, icons from the existing
  `@mui/icons-material`, theming from MUI v9's built-in CSS-vars support.
- **Unrelated latent bug:** `pdfjs-dist` is imported directly but is only present
  transitively via `react-pdf` — it is not in `package.json`. Not part of this
  overhaul; it will bite on a clean `npm ci`.
- **Out of scope, each needs an endpoint that doesn't exist:** password change on the
  profile page; a failure reason on failed documents (`extraction_jobs.error` is
  recorded but never exposed over HTTP); live status polling — a document stuck in
  `processing` still looks identical to one that's hung until manually reloaded.
