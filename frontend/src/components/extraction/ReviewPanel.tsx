import { Alert, Badge, Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import type {
  DocumentListItem,
  DocumentSummary,
  ReviewField,
} from "../../types";
import { countFlagged } from "../../utils/extractedValue";
import ExtractedValuesTable from "./ExtractedValuesTable";
import ExtractionSummary from "./ExtractionSummary";
import SummaryTab from "./SummaryTab";

interface ReviewPanelProps {
  document: DocumentListItem;
  fields: ReviewField[];
  summary: DocumentSummary | null;
  edits: Map<number, string | null>;
  activeColumnId: number | null;
  saving: boolean;
  saveError: string | null;
  onQuoteClick: (field: ReviewField) => void;
  onSetValue: (columnId: number, value: string | null) => void;
  onSave: () => void;
}

/** The right half of the split: progress, save, and the field table or summary. */
export default function ReviewPanel({
  document,
  fields,
  summary,
  edits,
  activeColumnId,
  saving,
  saveError,
  onQuoteClick,
  onSetValue,
  onSave,
}: ReviewPanelProps) {
  const [tab, setTab] = useState<"fields" | "summary">("fields");
  const flagged = countFlagged(fields);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      {/* Sticky header area */}
      <Box
        sx={{
          flexShrink: 0,
          px: 2.5,
          pt: 2,
          pb: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <ExtractionSummary
          document={document}
          fields={fields}
          edits={edits}
          saving={saving}
          onSave={onSave}
        />

        {/* Inside the sticky header, below the progress ring, so Save and the
            progress stay visible on both tabs. */}
        <Tabs
          value={tab}
          onChange={(_, next: "fields" | "summary") => setTab(next)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              py: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "none",
            },
          }}
        >
          <Tab
            value="fields"
            label={
              <Badge
                badgeContent={flagged}
                color="error"
                sx={{ "& .MuiBadge-badge": { right: -12, top: 2 } }}
              >
                Fields
              </Badge>
            }
          />
          <Tab value="summary" label="Summary" />
        </Tabs>
      </Box>

      {/* Scrollable content area */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto", px: 2.5, py: 2 }}>
        {saveError && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              borderRadius: 1.5,
              "& .MuiAlert-message": { fontWeight: 500 },
            }}
          >
            {saveError}
          </Alert>
        )}

        {tab === "fields" ? (
          <ExtractedValuesTable
            fields={fields}
            edits={edits}
            activeColumnId={activeColumnId}
            onQuoteClick={onQuoteClick}
            onSetValue={onSetValue}
          />
        ) : (
          <SummaryTab summary={summary} status={document.status} />
        )}
      </Box>
    </Box>
  );
}
