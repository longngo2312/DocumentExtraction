import { createTheme, type Theme } from "@mui/material/styles";

// Warm canvas, navy work colour. The chrome (canvas, text, borders) is warm —
// cream and yellow-undertone greys — while the data colours (blue/green/amber/
// red) stay exactly as they were, because they carry meaning in the review UI
// and retuning them would quietly change what a chip means.
//
// Two rules that are easy to break later:
//   1. Never hardcode a hex outside this file. A literal cannot respond to the
//      colour scheme, so it breaks dark mode silently.
//   2. `surface.viewer` is the same value in both schemes on purpose — see the
//      comment on the dark palette.

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

/** Display face for headings; falls back to the body stack. */
const DISPLAY = '"Space Grotesk", "DM Sans", system-ui, sans-serif';

// `shadows` must stay 25 long — MUI indexes into it by `elevation`, so a short
// literal throws on any elevation past the end. Patch the defaults instead.
const shadows = [...createTheme().shadows] as Theme["shadows"];
shadows[1] = "0 1px 2px rgba(31,30,28,0.05), 0 1px 3px rgba(31,30,28,0.04)";
shadows[2] = "0 2px 4px rgba(31,30,28,0.06), 0 4px 8px rgba(31,30,28,0.04)";
shadows[3] = "0 4px 8px rgba(31,30,28,0.07), 0 8px 16px rgba(31,30,28,0.05)";

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#1E3A5F",
          light: "#2E5A8F",
          dark: "#0F1F35",
          contrastText: "#FFFFFF",
        },
        secondary: {
          main: "#2563EB",
          light: "#5B8DEF",
          dark: "#1D4ED8",
          contrastText: "#FFFFFF",
        },
        success: { main: "#059669", light: "#34D399", dark: "#047857" },
        error: { main: "#DC2626", light: "#F87171", dark: "#B91C1C" },
        warning: { main: "#D97706", light: "#FBBF24", dark: "#B45309" },
        info: { main: "#2563EB", light: "#93C5FD", dark: "#1D4ED8" },
        background: { default: "#FAF9F5", paper: "#FFFFFF" },
        surface: {
          sunken: "#F2F0EA",
          viewer: "#F1F0EC",
          activeRow: "#EFF3F9",
          pendingRow: "#FBF6EC",
        },
        // #6B6A65 on #FAF9F5 is 5.14:1 — the tightest pair in the palette.
        // Recompute if you darken the canvas or lighten this.
        text: { primary: "#1F1E1C", secondary: "#6B6A65", disabled: "#8F8D86" },
        divider: "#E4E1D9",
      },
    },
    dark: {
      palette: {
        // Navy on near-black is ~1.3:1 — unreadable. The primary has to lighten
        // in dark; it is not the same colour with a different background.
        primary: {
          main: "#7FA9D9",
          light: "#A6C5E8",
          dark: "#5B87B8",
          contrastText: "#10202F",
        },
        secondary: {
          main: "#60A5FA",
          light: "#93C5FD",
          dark: "#3B82F6",
          contrastText: "#0B1B2E",
        },
        success: { main: "#34D399", light: "#6EE7B7", dark: "#059669" },
        error: { main: "#F87171", light: "#FCA5A5", dark: "#DC2626" },
        warning: { main: "#FBBF24", light: "#FCD34D", dark: "#D97706" },
        info: { main: "#60A5FA", light: "#93C5FD", dark: "#3B82F6" },
        background: { default: "#1A1917", paper: "#232220" },
        surface: {
          // Note the inversion: in light, `sunken` is lighter than the canvas;
          // here it is darker. "Recessed" is the constant, not the lightness.
          sunken: "#141312",
          // Safe to go dark: HighlightOverlay's `mixBlendMode: multiply`
          // composites against the rendered page (pdf.js paints a white canvas,
          // images bring their own pixels), not against this ground. A dark
          // desk is what every PDF reader does, and white pages pop against it.
          viewer: "#0F0E0D",
          activeRow: "#1E2A3A",
          pendingRow: "#2A2418",
        },
        text: { primary: "#EDEBE5", secondary: "#A3A099", disabled: "#6E6B65" },
        divider: "#35332F",
      },
    },
  },
  typography: {
    fontFamily: '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "-0.02em" },
    h2: { fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "-0.02em" },
    h3: { fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "-0.02em" },
    h4: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      letterSpacing: "-0.02em",
      fontSize: "1.6rem",
    },
    h5: { fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "-0.015em" },
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
      fontSize: "0.6rem",
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
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            borderBottom: `2px solid ${t.vars.palette.divider}`,
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
        },
        sizeSmall: { fontSize: "0.8rem", padding: "4px 12px" },
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
          // Was a hardcoded light grey — a bright track on a near-black card.
          backgroundColor: t.vars.palette.divider,
        }),
        bar: { borderRadius: 4 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: ({ theme: t }) => ({ borderColor: t.vars.palette.divider }),
      },
    },
  },
});

export default theme;
