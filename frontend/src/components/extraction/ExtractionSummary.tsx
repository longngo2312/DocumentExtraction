import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { DocumentListItem, ReviewField } from "../../types";
import { countDecided } from "../../utils/extractedValue";
import DocumentStatusChip from "../document/DocumentStatusChip";

interface ExtractionSummaryProps {
  document: DocumentListItem;
  fields: ReviewField[];
  edits: Map<number, string | null>;
  saving: boolean;
  onSave: () => void;
}

/**
 * Header for the review gate: which document, how far through the reviewer is,
 * and the single action that persists every verdict at once.
 */
export default function ExtractionSummary({
  document,
  fields,
  edits,
  saving,
  onSave,
}: ExtractionSummaryProps) {
  const navigate = useNavigate();

  const decided = countDecided(fields, edits);
  const total = fields.length;
  const percent = total === 0 ? 0 : (decided / total) * 100;
  const allReviewed = total > 0 && decided >= total;

  return (
    <Box>
      {/* Breadcrumb navigation */}
      <Button
        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
        onClick={() => navigate("/documents")}
        size="small"
        sx={{
          mb: 1.5,
          color: "text.secondary",
          fontSize: "0.75rem",
          fontWeight: 500,
          px: 1,
          "&:hover": { bgcolor: "action.hover", color: "text.primary" },
        }}
      >
        Back to Documents
      </Button>

      {/* Document info row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
        }}
      >
        {/* Left: title + status */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: "1.05rem",
                color: "text.primary",
                lineHeight: 1.3,
              }}
              noWrap
            >
              {document.filename}
            </Typography>
            <DocumentStatusChip status={document.status} />
          </Box>

          {/* Progress stats */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
            {/* Circular progress ring */}
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <CircularProgress
                variant="determinate"
                value={100}
                size={40}
                thickness={4}
                sx={{ color: "divider" }}
              />
              <CircularProgress
                variant="determinate"
                value={percent}
                size={40}
                thickness={4}
                sx={{
                  position: "absolute",
                  left: 0,
                  color: allReviewed ? "success.main" : "secondary.main",
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.65rem",
                    color: allReviewed ? "success.main" : "text.primary",
                  }}
                >
                  {Math.round(percent)}%
                </Typography>
              </Box>
            </Box>

            {/* Text stats */}
            <Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3 }}
              >
                {decided} of {total} fields reviewed
              </Typography>
              {edits.size > 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: "warning.dark", fontWeight: 500 }}
                >
                  {edits.size} unsaved{" "}
                  {edits.size === 1 ? "change" : "changes"}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* Save button */}
        <Button
          variant="contained"
          startIcon={
            saving ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SaveIcon sx={{ fontSize: 18 }} />
            )
          }
          disabled={saving || total === 0 || decided < total || edits.size === 0}
          onClick={onSave}
          sx={{
            flexShrink: 0,
            px: 3,
            py: 1,
            bgcolor: allReviewed && edits.size > 0
              ? "success.main"
              : "primary.main",
            "&:hover": {
              bgcolor: allReviewed && edits.size > 0
                ? "success.dark"
                : "primary.dark",
            },
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
          }}
        >
          {saving ? "Saving..." : "Save Review"}
        </Button>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          bgcolor: "divider",
          "& .MuiLinearProgress-bar": {
            bgcolor: allReviewed ? "success.main" : "secondary.main",
            transition: "transform 0.4s ease, background-color 0.3s ease",
          },
        }}
      />

      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
