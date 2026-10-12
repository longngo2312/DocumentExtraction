import { Chip, Typography } from "@mui/material";
import type { ReviewField } from "../../types";
import { booleanLabel } from "../../utils/extractedValue";

interface ExtractedValueCellProps {
  field: ReviewField;
  /** Unsaved edit, when the reviewer has changed this field in this session. */
  pendingValue: string | null | undefined;
}

/** Read-only rendering of one value, shaped by its data_type. */
export default function ExtractedValueCell({
  field,
  pendingValue,
}: ExtractedValueCellProps) {
  const value = pendingValue === undefined ? field.value_text : pendingValue;

  if (value === null || value === "") {
    return (
      <Typography
        variant="body2"
        sx={{
          fontStyle: "italic",
          color: pendingValue === null ? "error.main" : "text.disabled",
          fontWeight: pendingValue === null ? 500 : 400,
        }}
      >
        {pendingValue === null ? "Rejected" : "Not found"}
      </Typography>
    );
  }

  if (field.data_type === "boolean") {
    return (
      <Chip
        label={booleanLabel(value)}
        size="small"
        variant="outlined"
        color={value === "true" ? "success" : "default"}
        sx={{ fontWeight: 500 }}
      />
    );
  }

  if (field.data_type === "enum") {
    return (
      <Chip
        label={value}
        size="small"
        variant="outlined"
        sx={{ fontWeight: 500, borderColor: "divider" }}
      />
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ fontWeight: 500, color: "text.primary" }}
    >
      {value}
    </Typography>
  );
}
