import { Box, Button, TextField, Typography } from "@mui/material";
import type { ReviewField } from "../../types";
import ExtractedValueCell from "./ExtractedValueCell";
import InferenceNote from "./InferenceNote";
import SourceQuoteCell from "./SourceQuoteCell";

function FieldLabel({ children }: { children: string }) {
  return (
    <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  );
}

interface ExtractedValueRowBodyProps {
  field: ReviewField;
  pendingValue: string | null | undefined;
  active: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onQuoteClick: (field: ReviewField) => void;
}

/** Value and source, side by side on desktop and stacked on a phone. */
export default function ExtractedValueRowBody({
  field,
  pendingValue,
  active,
  editing,
  draft,
  onDraftChange,
  onSaveEdit,
  onCancelEdit,
  onQuoteClick,
}: ExtractedValueRowBodyProps) {
  return (
    <Box
      sx={{
        display: "flex",
        // A 140px-minimum source column next to a value column does not fit on
        // a phone; stack instead of letting both get squeezed.
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 1.5, sm: 3 },
        px: 2,
        pb: 1.5,
        alignItems: "flex-start",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
        <FieldLabel>Value</FieldLabel>

        {editing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <TextField
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              size="small"
              autoFocus
              fullWidth
              aria-label={`Value for ${field.name}`}
              sx={{
                "& .MuiOutlinedInput-root": {
                  fontSize: "0.8125rem",
                  borderRadius: 1.5,
                },
              }}
            />
            <Box sx={{ display: "flex", gap: 0.75 }}>
              <Button
                size="small"
                variant="contained"
                onClick={onSaveEdit}
                sx={{ fontSize: "0.7rem", py: 0.25, px: 1.5 }}
              >
                Apply
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={onCancelEdit}
                sx={{ fontSize: "0.7rem", py: 0.25, px: 1.5 }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        ) : (
          // No hover tooltip on the value: it covered the rows underneath on
          // the way to a click. The Box stays — it was the tooltip's anchor,
          // but its inline-block is also what sizes the cell.
          <Box>
            <Box sx={{ display: "inline-block" }}>
              <ExtractedValueCell field={field} pendingValue={pendingValue} />
            </Box>
            <InferenceNote field={field} />
          </Box>
        )}
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          width: { xs: "100%", sm: "auto" },
          minWidth: { sm: 140 },
          maxWidth: { sm: 260 },
        }}
      >
        <FieldLabel>Source</FieldLabel>
        <SourceQuoteCell field={field} active={active} onQuoteClick={onQuoteClick} />
      </Box>
    </Box>
  );
}
