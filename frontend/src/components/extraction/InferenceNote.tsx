import { Box, Chip, Typography } from "@mui/material";
import type { ReviewField } from "../../types";
import { confidenceBand } from "../../utils/extractedValue";
import GroundingChip from "./GroundingChip";

const BAND_COLOR: Record<string, string> = {
  high: "success.main",
  medium: "warning.main",
  low: "error.main",
};

interface InferenceNoteProps {
  field: ReviewField;
}

/**
 * How the model got here, shown under the value — but only when there is
 * something to say.
 *
 * A stated field with no reasoning renders nothing at all. That is the common
 * case, and hanging empty chips off every row is what makes a field table
 * unreadable.
 */
export default function InferenceNote({ field }: InferenceNoteProps) {
  const inferred = field.basis === "inferred";
  const band = confidenceBand(field.llm_confidence);

  if (!inferred && !field.llm_reasoning) return null;

  return (
    <Box sx={{ mt: 0.75, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {field.basis && (
          <Chip
            label={field.basis}
            size="small"
            variant="outlined"
            sx={{
              height: 18,
              fontSize: "0.6rem",
              fontWeight: 600,
              borderColor: inferred ? "secondary.main" : "divider",
              color: inferred ? "secondary.main" : "text.secondary",
              bgcolor: inferred ? "surface.activeRow" : "transparent",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}

        {band && (
          <Typography
            variant="caption"
            sx={{ fontSize: "0.6rem", fontWeight: 600, color: BAND_COLOR[band] }}
          >
            {band} confidence
          </Typography>
        )}

        {/* Only inferred fields are sent to the grounding check, so only they
            have a verdict — or a meaningful absence of one. */}
        {inferred && <GroundingChip support={field.support} />}
      </Box>

      {field.llm_reasoning && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontSize: "0.7rem",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {field.llm_reasoning}
        </Typography>
      )}
    </Box>
  );
}
