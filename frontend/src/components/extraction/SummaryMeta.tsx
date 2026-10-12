import { Box, Chip, Typography } from "@mui/material";
import type { DocumentSummary } from "../../types";
import { formatDayTime } from "../../utils/format";

interface SummaryMetaProps {
  summary: DocumentSummary;
  /** Whether the values have been reviewed since this summary was written. */
  stale: boolean;
}

/** Provenance for the summary itself: which model, when, and against what. */
export default function SummaryMeta({ summary, stale }: SummaryMetaProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        pt: 1.5,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", fontSize: "0.65rem" }}
      >
        {summary.model} · {formatDayTime(summary.generated_at)} ·{" "}
        {summary.input_chars.toLocaleString()} chars read
      </Typography>

      <Box sx={{ flexGrow: 1 }} />

      {stale && (
        <Chip
          label="Generated before review — values may have changed since"
          size="small"
          color="warning"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: "0.6rem",
            fontWeight: 600,
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      )}
    </Box>
  );
}
