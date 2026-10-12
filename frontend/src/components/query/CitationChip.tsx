import { Chip, Tooltip, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { QueryCitation } from "../../api/query";
import type { ActiveQuote } from "../../types";

interface CitationChipProps {
  citation: QueryCitation;
  index: number;
}

/**
 * A numbered source marker. Clicking navigates to the document review page and
 * hands it an ActiveQuote in router state, which that page picks up on mount to
 * drive the existing highlight machinery.
 */
export default function CitationChip({ citation, index }: CitationChipProps) {
  const navigate = useNavigate();

  function open() {
    const quote: ActiveQuote = {
      // No column owns a chat citation; -1 marks "not a field".
      columnId: -1,
      quote: citation.quote,
      pageNumber: citation.page,
      start: null,
      end: null,
      boxes: citation.boxes,
    };
    navigate(`/documents/${citation.document_id}`, { state: { quote } });
  }

  return (
    <Tooltip
      title={
        <>
          <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
            {citation.filename} · p.{citation.page}
          </Typography>
          <Typography variant="caption">{citation.quote}</Typography>
        </>
      }
    >
      <Chip
        component="button"
        clickable
        onClick={open}
        size="small"
        label={index + 1}
        aria-label={`Source ${index + 1}: ${citation.filename}, page ${citation.page}`}
        sx={{
          height: 18,
          minWidth: 18,
          mx: 0.25,
          cursor: "pointer",
          fontSize: "0.65rem",
          fontWeight: 700,
          bgcolor: "surface.activeRow",
          color: "primary.main",
          border: 0,
          "& .MuiChip-label": { px: 0.5 },
        }}
      />
    </Tooltip>
  );
}
