import FindInPageIcon from "@mui/icons-material/FindInPage";
import { Box, Button, Chip, Tooltip, Typography } from "@mui/material";
import type { ReviewField } from "../../types";
import {
  formatConfidence,
  hasLocatableQuote,
} from "../../utils/extractedValue";

const MATCH_COLOR = {
  exact: "success",
  normalized: "warning",
  none: "error",
} as const;

interface SourceQuoteCellProps {
  field: ReviewField;
  active: boolean;
  onQuoteClick: (field: ReviewField) => void;
}

/**
 * The provenance cell, and the entry point to the document panel.
 *
 * A quote the server could not place (match_kind "none") is deliberately not
 * clickable — the model invented it, and sending the reviewer to a page where it
 * does not appear is worse than saying so.
 */
export default function SourceQuoteCell({
  field,
  active,
  onQuoteClick,
}: SourceQuoteCellProps) {
  if (!field.llm_quote) {
    return (
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ fontStyle: "italic" }}
      >
        No quote
      </Typography>
    );
  }

  if (!hasLocatableQuote(field)) {
    return (
      <Tooltip title={field.llm_quote}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.disabled"
            noWrap
            sx={{
              display: "block",
              fontStyle: "italic",
              maxWidth: 180,
            }}
          >
            &ldquo;{field.llm_quote}&rdquo;
          </Typography>
          <Chip
            label="not in document"
            size="small"
            variant="outlined"
            color="error"
            sx={{ height: 18, fontSize: "0.6rem", mt: 0.5 }}
          />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* No tooltip on the locate button: it popped the full quote over the row
          the moment the pointer crossed it, covering the values underneath on
          the way to a click. The quote is in the document panel anyway, which is
          what this button is for. */}
      <Button
        size="small"
        startIcon={<FindInPageIcon sx={{ fontSize: 14 }} />}
        onClick={() => onQuoteClick(field)}
        variant={active ? "contained" : "text"}
        sx={{
          textTransform: "none",
          justifyContent: "flex-start",
          maxWidth: "100%",
          py: 0.25,
          px: 1,
          fontSize: "0.75rem",
          borderRadius: 1,
          ...(active
            ? {
                bgcolor: "secondary.main",
                "&:hover": { bgcolor: "secondary.dark" },
              }
            : {
                color: "secondary.main",
                bgcolor: "surface.activeRow",
                "&:hover": { bgcolor: "action.selected" },
              }),
        }}
      >
        <Typography
          variant="caption"
          noWrap
          sx={{ fontWeight: 500, maxWidth: 150 }}
        >
          &ldquo;{field.llm_quote}&rdquo;
        </Typography>
      </Button>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          mt: 0.5,
          pl: 0.5,
        }}
      >
        {field.match_kind && (
          <Chip
            label={field.match_kind}
            size="small"
            variant="outlined"
            color={MATCH_COLOR[field.match_kind]}
            sx={{ height: 18, fontSize: "0.6rem" }}
          />
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "0.65rem" }}
        >
          {formatConfidence(field.confidence)}
          {field.source_page !== null && ` \u00B7 p.${field.source_page}`}
        </Typography>
      </Box>
    </Box>
  );
}
