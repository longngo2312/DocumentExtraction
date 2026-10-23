import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

interface WorkspaceTopBarProps {
  backTo: string;
  backLabel: string;
  title: string;
  /** Muted line under the title — a schema name, a page count. */
  subtitle?: string;
  /** The segmented control. Held in its own grid column so it stays centred
   *  on the viewport regardless of how long the title or actions get. */
  center?: ReactNode;
  actions?: ReactNode;
}

/**
 * The focused-workspace header: back and title on the left, a view switcher
 * dead centre, actions on the right. Replaces page chrome entirely on screens
 * that are a workspace rather than a list.
 */
export default function WorkspaceTopBar({
  backTo,
  backLabel,
  title,
  subtitle,
  center,
  actions,
}: WorkspaceTopBarProps) {
  return (
    <Box
      sx={{
        display: "grid",
        // The 1fr side columns are what centre the middle one; with auto
        // columns the switcher drifts as the title length changes.
        gridTemplateColumns: { xs: "1fr auto", md: "1fr auto 1fr" },
        alignItems: "center",
        gap: 2,
        px: { xs: 1.5, sm: 2 },
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <Tooltip title={backLabel}>
          <IconButton
            component={RouterLink}
            to={backTo}
            size="small"
            aria-label={backLabel}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          {/* body2, not subtitle2: the theme uppercases subtitle2, and this is
              a filename — the reader compares it as written. */}
          <Typography variant="body2" noWrap title={title} sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>

      {center && (
        <Box sx={{ display: { xs: "none", md: "block" }, justifySelf: "center" }}>
          {center}
        </Box>
      )}

      {actions && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifySelf: "end" }}
        >
          {actions}
        </Stack>
      )}
    </Box>
  );
}
