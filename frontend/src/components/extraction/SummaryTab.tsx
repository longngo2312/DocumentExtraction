import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import type { DocumentStatus, DocumentSummary } from "../../types";
import SummaryMeta from "./SummaryMeta";
import SummarySection from "./SummarySection";

interface SummaryTabProps {
  summary: DocumentSummary | null;
  status: DocumentStatus;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 5,
        textAlign: "center",
        borderRadius: 2,
        borderStyle: "dashed",
        bgcolor: "surface.sunken",
      }}
    >
      <Typography color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: "0.8125rem" }}
      >
        {detail}
      </Typography>
    </Paper>
  );
}

/**
 * Three real states, not two.
 *
 * The one worth getting right is the third: the summary call is wrapped in a
 * try/catch in the worker so it cannot fail a document, which means "no summary"
 * is a permanent outcome and not a stage that will eventually finish. Showing a
 * spinner there would wait forever.
 */
export default function SummaryTab({ summary, status }: SummaryTabProps) {
  if (!summary) {
    if (status === "uploaded" || status === "processing") {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <Box sx={{ textAlign: "center" }}>
            <CircularProgress size={28} sx={{ mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary">
              Being generated…
            </Typography>
          </Box>
        </Box>
      );
    }

    return (
      <EmptyState
        title="No summary was generated for this document"
        detail="The summary step did not complete. Extraction and review are unaffected."
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography variant="body2" sx={{ fontSize: "0.8125rem", lineHeight: 1.6 }}>
        {summary.overview}
      </Typography>

      <SummarySection
        title="Key findings"
        items={summary.key_findings}
        accent="secondary.main"
      />

      <SummarySection
        title="Check by hand"
        items={summary.caveats}
        accent="warning.main"
      />

      {/* Summaries are written once, in the worker, before any human sees the
          document — so a reviewed document's summary is necessarily older than
          its values. No regeneration path exists yet; this labels it instead. */}
      <SummaryMeta summary={summary} stale={status === "reviewed"} />
    </Box>
  );
}
