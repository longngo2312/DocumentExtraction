import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { QueryCitation } from "../../api/query";
import type { ActiveQuote } from "../../types";

interface SourcesListProps {
  citations: QueryCitation[];
}

export default function SourcesList({ citations }: SourcesListProps) {
  const navigate = useNavigate();

  if (citations.length === 0) return null;

  function open(citation: QueryCitation) {
    const quote: ActiveQuote = {
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
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mt: 1.5,
        bgcolor: "transparent",
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{ px: 0, minHeight: 36, "& .MuiAccordionSummary-content": { my: 0.5 } }}
      >
        <Typography variant="overline" color="text.secondary">
          {citations.length} source{citations.length === 1 ? "" : "s"}
        </Typography>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        <Stack spacing={1}>
          {citations.map((citation, index) => (
            <Box
              key={`${citation.document_id}-${index}`}
              component="button"
              onClick={() => open(citation)}
              sx={{
                textAlign: "left",
                width: "100%",
                border: 1,
                borderColor: "divider",
                borderRadius: 1.5,
                bgcolor: "background.paper",
                p: 1.25,
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                [{index + 1}] {citation.filename} · p.{citation.page}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25, fontStyle: "italic" }}
              >
                “{citation.quote}”
              </Typography>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
