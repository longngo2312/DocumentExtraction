import { Box, Divider, Tab, Tabs, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";

export type SplitPaneTab = "left" | "right";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  leftLabel: string;
  rightLabel: string;
  /** Which pane is showing on narrow screens. Controlled so callers can switch
   *  to the document pane when the reviewer clicks a quote. */
  mobileTab: SplitPaneTab;
  onMobileTabChange: (tab: SplitPaneTab) => void;
}

/**
 * Two equal-width panes separated by a thin divider, collapsing to tabs under
 * `md` — a 50% panel on a phone is unusable for both reading a document and
 * editing values.
 */
export default function SplitPane({
  left,
  right,
  leftLabel,
  rightLabel,
  mobileTab,
  onMobileTabChange,
}: SplitPaneProps) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));

  if (isNarrow) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Tabs
          value={mobileTab}
          onChange={(_event, value) => onMobileTabChange(value as SplitPaneTab)}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
            bgcolor: "background.paper",
            "& .MuiTab-root": {
              fontWeight: 600,
              fontSize: "0.8rem",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            },
          }}
        >
          <Tab value="left" label={leftLabel} />
          <Tab value="right" label={rightLabel} />
        </Tabs>
        <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}>
          {mobileTab === "left" ? left : right}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left pane — document viewer (50%) */}
      <Box
        sx={{
          width: "50%",
          minWidth: 0,
          overflow: "hidden",
          bgcolor: "surface.viewer",
        }}
      >
        {left}
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Right pane — review panel (50%) */}
      <Box sx={{ width: "50%", minWidth: 0, overflow: "hidden" }}>
        {right}
      </Box>
    </Box>
  );
}
