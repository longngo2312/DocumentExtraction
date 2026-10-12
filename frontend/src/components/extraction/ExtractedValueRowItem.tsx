import { Box, Chip, Paper, Typography } from "@mui/material";
import { useState } from "react";
import type { ReviewField } from "../../types";
import type { Flag } from "../../utils/extractedValue";
import { flagFor, projectStatus } from "../../utils/extractedValue";
import ExtractedValueRowBody from "./ExtractedValueRowBody";
import ReviewActions from "./ReviewActions";
import ReviewStatusChip from "./ReviewStatusChip";

/** Left-border accent per review status, as palette paths. */
const STATUS_BORDER: Record<string, string> = {
  unreviewed: "divider",
  accepted: "success.main",
  edited: "secondary.main",
  rejected: "error.main",
};

/**
 * Flags override the status accent while a field is still unreviewed.
 *
 * Without this the whole grounding check is invisible until someone opens the
 * row — and a contradicted inference looks exactly like every other unreviewed
 * field, which is the one outcome Stage 5 exists to prevent.
 */
const FLAG_BORDER: Record<Flag, string> = {
  fabricated: "error.main",
  contradicted: "error.main",
  unsupported: "warning.main",
  unverified: "divider",
};

const FLAG_LABEL: Record<Flag, string> = {
  fabricated: "quote not found",
  contradicted: "contradicted",
  unsupported: "unsupported",
  unverified: "unverified",
};

interface ExtractedValueRowItemProps {
  field: ReviewField;
  pendingValue: string | null | undefined;
  active: boolean;
  onQuoteClick: (field: ReviewField) => void;
  onSetValue: (columnId: number, value: string | null) => void;
}

export default function ExtractedValueRowItem({
  field,
  pendingValue,
  active,
  onQuoteClick,
  onSetValue,
}: ExtractedValueRowItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const status = projectStatus(field, pendingValue);
  const pending = pendingValue !== undefined;
  const flag = flagFor(field);

  // Once a reviewer has ruled on the field, their verdict is the more useful
  // accent — the flag did its job getting them here.
  const showFlag = flag !== null && status === "unreviewed";
  const borderColor = showFlag
    ? FLAG_BORDER[flag]
    : (STATUS_BORDER[status] ?? "divider");

  function startEdit() {
    const current = pendingValue === undefined ? field.value_text : pendingValue;
    setDraft(current ?? "");
    setEditing(true);
  }

  function saveEdit() {
    onSetValue(field.column_id, draft);
    setEditing(false);
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        borderLeft: 3,
        borderLeftStyle: "solid",
        borderLeftColor: borderColor,
        borderRadius: 1.5,
        overflow: "hidden",
        transition: "all 150ms ease",
        bgcolor: active
          ? "surface.activeRow"
          : pending
            ? "surface.pendingRow"
            : "background.paper",
        "&:hover": { boxShadow: 1 },
      }}
    >
      {/* Header row: field name + type + status + actions */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          px: 2,
          pt: 1.5,
          pb: 0.75,
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3, minWidth: 0 }}
          noWrap
        >
          {field.name}
        </Typography>

        <Chip
          label={field.data_type}
          size="small"
          variant="outlined"
          sx={{
            height: 18,
            fontSize: "0.6rem",
            borderColor: "divider",
            color: "text.secondary",
            fontWeight: 500,
          }}
        />

        {showFlag && (
          <Chip
            label={FLAG_LABEL[flag]}
            size="small"
            sx={{
              height: 18,
              fontSize: "0.6rem",
              fontWeight: 700,
              color: "common.white",
              bgcolor: FLAG_BORDER[flag],
              // "unverified" is an absence of information, not a problem with the
              // field — it should not shout like a contradiction does.
              ...(flag === "unverified" && {
                color: "text.secondary",
                bgcolor: "transparent",
                border: 1,
                borderColor: "divider",
              }),
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}

        <Box sx={{ flexGrow: 1 }} />

        <ReviewStatusChip status={status} pending={pending} />

        <ReviewActions
          status={status}
          fieldName={field.name}
          onAccept={() => onSetValue(field.column_id, field.llm_value)}
          onEdit={startEdit}
          onReject={() => onSetValue(field.column_id, null)}
        />
      </Box>

      <ExtractedValueRowBody
        field={field}
        pendingValue={pendingValue}
        active={active}
        editing={editing}
        draft={draft}
        onDraftChange={setDraft}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditing(false)}
        onQuoteClick={onQuoteClick}
      />
    </Paper>
  );
}
