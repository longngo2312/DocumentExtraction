import { createTheme, type Theme } from "@mui/material/styles";

// A neutral, professional workspace: slate greys for every surface, one blue
// for action, and the semantic four (green/red/amber/blue) reserved for state.
// Nothing decorative — the document and its extracted values are the only
// things on screen allowed to be colourful.
//
// Colours are the standard slate/blue/green/red/amber ramps. Using a published
// ramp rather than hand-mixed hexes is what keeps the two schemes consistent:
// each dark value is a lighter step of the same hue as its light counterpart.
//
// Three rules that are easy to break later:
//   1. Never hardcode a hex outside this file. A literal cannot respond to the
//      colour scheme, so it breaks dark mode silently.
//   2. Contrast is measured against the ground a colour actually sits on. The
//      tight pairs are recorded in comments — recompute them if you retune.
//   3. The accent is a different step per scheme (blue-600 in light, blue-400
//      in dark) so that `primary.main` is readable as text on either canvas.
//      Always reach for `primary.main`; do not hand-pick a step per component.

declare module "@mui/material/styles" {
  interface Palette {
    surface: {
      /** Recessed ground: table heads, empty states, the sidebar. */
      sunken: string;
      /** The "desk" behind rendered document pages. */
      viewer: string;
      /** Selected / active-quote row wash. */
      activeRow: string;
      /** Unreviewed (pending) row wash. */
      pendingRow: string;
    };
  }
  interface PaletteOptions {
    surface?: Partial<Palette["surface"]>;
  }
}

// `shadows` must stay 25 long — MUI indexes into it by `elevation`, so a short
// literal throws on any elevation past the end. Patch the defaults instead.
// Slate-tinted rather than neutral black: a pure-black shadow over a slate
// surface reads as a grey smudge.
const shadows = [...createTheme().shadows] as Theme["shadows"];
shadows[1] = "0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.10)";
shadows[2] = "0 2px 4px rgba(15,23,42,0.06), 0 4px 8px rgba(15,23,42,0.10)";
shadows[3] = "0 4px 8px rgba(15,23,42,0.08), 0 8px 16px rgba(15,23,42,0.12)";

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: {
    light: {
      palette: {
        // #2563EB on #FFFFFF is 5.2:1 — it works as both button fill (white
        // label, 5.1:1) and accent text. In light mode one value covers both.
        primary: {
          main: "#2563EB",
          light: "#3B82F6",
          dark: "#1D4ED8",
          contrastText: "#FFFFFF",
        },
        secondary: {
          main: "#475569",
          light: "#64748B",
          dark: "#334155",
          contrastText: "#FFFFFF",
        },
        success: { main: "#15803D", light: "#22C55E", dark: "#166534" },
        error: { main: "#DC2626", light: "#EF4444", dark: "#B91C1C" },
        warning: { main: "#B45309", light: "#F59E0B", dark: "#92400E" },
        info: { main: "#0369A1", light: "#0EA5E9", dark: "#075985" },
        background: { default: "#F8FAFC", paper: "#FFFFFF" },
        surface: {
          sunken: "#F1F5F9",
          viewer: "#E2E8F0",
          activeRow: "#EFF6FF",
          pendingRow: "#FEF3C7",
        },
        // #475569 on #F8FAFC is 7.1:1 — the tightest text pair in the scheme.
        text: { primary: "#0F172A", secondary: "#475569", disabled: "#94A3B8" },
        divider: "#E2E8F0",
      },
    },
    dark: {
      palette: {
        // Built from the five given colours: #000000, #0000FF, #56AAFF,
        // #FFFFFF, #626568. Five cannot cover a UI that needs a canvas, a
        // raised card, a recessed rail and three tiers of text, so the
        // near-blacks and the mid greys below are steps between the given
        // ones — never a new hue.
        //
        // #56AAFF is the accent: 8.1:1 as text on the canvas, and it carries
        // a black label at 8.6:1 when it is a button fill. #0000FF cannot be
        // text on black (2.3:1), so it appears only as a fill under white
        // (8.6:1) and as the selection wash — see `secondary` and
        // `surface.activeRow`.
        primary: {
          main: "#56AAFF",
          light: "#8FC6FF",
          dark: "#2E90F5",
          contrastText: "#000000",
        },
        // The one place the pure blue shows at full strength: a filled chip
        // or button with a white label.
        secondary: {
          main: "#0000FF",
          light: "#4444FF",
          dark: "#0000CC",
          contrastText: "#FFFFFF",
        },
        success: { main: "#4ADE80", light: "#86EFAC", dark: "#22C55E" },
        error: { main: "#F87171", light: "#FCA5A5", dark: "#EF4444" },
        warning: { main: "#FBBF24", light: "#FCD34D", dark: "#F59E0B" },
        info: { main: "#56AAFF", light: "#8FC6FF", dark: "#2E90F5" },
        background: { default: "#0A0B0C", paper: "#141618" },
        surface: {
          // Pure black is the recessed ground — the rail and the table heads
          // sit below the canvas rather than above it.
          sunken: "#000000",
          // The viewer desk is the darkest ground in the app so a white PDF
          // page reads as lit. HighlightOverlay's `mixBlendMode: multiply`
          // composites against the rendered page, not against this ground.
          viewer: "#000000",
          // #0000FF sunk into black. The accent still reads 7.8:1 on it, so
          // the active nav pill and the selected row stay legible.
          activeRow: "#0A0A33",
          pendingRow: "#422006",
        },
        // #626568 is 3.3:1 on the canvas — too low for body text, so it is
        // the disabled tier and a lighter step of it carries secondary text
        // at 7.1:1.
        text: { primary: "#FFFFFF", secondary: "#9A9DA1", disabled: "#626568" },
        // #626568 darkened: at full strength a hairline of it reads as a
        // drawn line rather than an edge.
        divider: "#2A2C2E",
      },
    },
  },
  typography: {
    // One face, the full weight range. Inter's tabular figures are why the
    // extracted-value columns line up without a separate mono stack.
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.025em" },
    h2: { fontWeight: 700, letterSpacing: "-0.025em" },
    h3: { fontWeight: 600, letterSpacing: "-0.02em" },
    h4: { fontWeight: 600, letterSpacing: "-0.02em", fontSize: "1.625rem" },
    h5: { fontWeight: 600, letterSpacing: "-0.015em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600, fontSize: "0.95rem" },
    subtitle2: {
      fontWeight: 600,
      fontSize: "0.85rem",
      letterSpacing: "0.02em",
      textTransform: "uppercase" as const,
    },
    body2: { fontSize: "0.8125rem" },
    caption: { fontSize: "0.7rem", fontWeight: 500 },
    // The single home for what used to be ~12 scattered `fontSize: "0.6rem"`.
    overline: {
      fontSize: "0.625rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      lineHeight: 1.6,
    },
  },
  shape: { borderRadius: 8 },
  shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: (t) => ({
        ":focus-visible": {
          outline: `2px solid ${t.vars.palette.primary.main}`,
          outlineOffset: 2,
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      }),
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 6 },
        sizeSmall: { height: 22, fontSize: "0.7rem" },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          "& .MuiTableCell-head": {
            backgroundColor: t.vars.palette.surface.sunken,
            color: t.vars.palette.text.secondary,
            fontWeight: 600,
            fontSize: "0.7rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
            borderBottom: `1px solid ${t.vars.palette.divider}`,
            padding: "10px 16px",
          },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderBottom: `1px solid ${t.vars.palette.divider}`,
          padding: "10px 16px",
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          "&.MuiTableRow-hover:hover": {
            backgroundColor: t.vars.palette.action.hover,
          },
          "&.Mui-selected": {
            backgroundColor: t.vars.palette.surface.activeRow,
            "&:hover": { backgroundColor: t.vars.palette.surface.activeRow },
          },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 600,
          borderRadius: 6,
          // 150-300ms per the interaction rules; the press scale is the
          // cheapest honest "I registered that" signal.
          transition:
            "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease",
          "&:active": { transform: "scale(0.985)" },
        },
        sizeSmall: { fontSize: "0.8rem", padding: "5px 12px" },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: 4,
          height: 6,
          backgroundColor: t.vars.palette.divider,
        }),
        bar: { borderRadius: 4 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // MUI tints dark-mode Paper with a white overlay image that fights the
        // slate ramp — the palette value is the whole story.
        root: { backgroundImage: "none" },
        outlined: ({ theme: t }) => ({ borderColor: t.vars.palette.divider }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.surface.sunken,
          borderRight: `1px solid ${t.vars.palette.divider}`,
          backgroundImage: "none",
        }),
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.surface.sunken,
          color: t.vars.palette.text.primary,
          border: `1px solid ${t.vars.palette.divider}`,
          fontSize: "0.75rem",
          borderRadius: 6,
        }),
        arrow: ({ theme: t }) => ({ color: t.vars.palette.surface.sunken }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.background.paper,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: t.vars.palette.divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: t.vars.palette.text.disabled,
          },
        }),
      },
    },
  },
});

export default theme;
