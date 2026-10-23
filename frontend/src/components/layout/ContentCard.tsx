import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import {
  Box,
  Card,
  CardActionArea,
  IconButton,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

interface ContentCardProps {
  to: string;
  title: string;
  /** The muted second line — an age, a count, a schema name. */
  meta: ReactNode;
  /** Fills the preview panel above the footer. */
  preview: ReactNode;
  /** Pinned to the preview's top-left: a status chip, a type label. */
  badge?: ReactNode;
  /** Menu contents. Rendered outside the link — a button inside an anchor is
   *  invalid markup and the control becomes unreachable by keyboard. */
  menu?: (close: () => void) => ReactNode;
  menuLabel?: string;
}

/**
 * The collection card: a preview panel over a two-line footer, with an
 * overflow menu floating at the top-right. Documents and schemas both render
 * through this so a card means the same thing on every page.
 */
export default function ContentCard({
  to,
  title,
  meta,
  preview,
  badge,
  menu,
  menuLabel = "More actions",
}: ContentCardProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);

  return (
    <Card
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
        // No translate on hover: a grid of cards that each jump a few pixels
        // reads as jitter, and it shifts the overflow button out from under
        // the cursor on the way to it.
        "&:hover": { borderColor: "primary.main", boxShadow: 2 },
        "&:focus-within": { borderColor: "primary.main" },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={to}
        sx={{ display: "block", height: "100%" }}
      >
        <Box
          sx={{
            position: "relative",
            aspectRatio: "16 / 10",
            display: "grid",
            placeItems: "center",
            bgcolor: "surface.sunken",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {preview}
          {badge && (
            <Box sx={{ position: "absolute", top: 10, left: 10 }}>{badge}</Box>
          )}
        </Box>

        <Box sx={{ p: 1.75, pr: 5 }}>
          {/* body2, not subtitle2: the theme uppercases subtitle2, and these
              are filenames and names — the reader compares them as written. */}
          <Typography variant="body2" noWrap title={title} sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
            noWrap
            sx={{ mt: 0.25 }}
          >
            {meta}
          </Typography>
        </Box>
      </CardActionArea>

      {menu && (
        <>
          <Tooltip title={menuLabel}>
            <IconButton
              size="small"
              aria-label={`${menuLabel} for ${title}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(anchorEl)}
              onClick={(event) => setAnchorEl(event.currentTarget)}
              sx={{
                position: "absolute",
                right: 8,
                bottom: 12,
                bgcolor: "background.paper",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
            {menu(close)}
          </Menu>
        </>
      )}
    </Card>
  );
}

/** The glyph a preview panel shows when there is no real thumbnail to show. */
export function PreviewGlyph({
  icon,
  caption,
}: {
  icon: ReactNode;
  caption?: string;
}) {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", color: "text.disabled" }}>
      <Box sx={{ display: "grid", placeItems: "center", fontSize: 44 }}>
        {icon}
      </Box>
      {caption && (
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          {caption}
        </Typography>
      )}
    </Stack>
  );
}
