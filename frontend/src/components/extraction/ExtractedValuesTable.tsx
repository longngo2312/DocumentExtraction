import { Box, Paper, Typography } from "@mui/material";
import type { ReviewField } from "../../types";
import ExtractedValueRowItem from "./ExtractedValueRowItem";

interface ExtractedValuesTableProps {
  fields: ReviewField[];
  edits: Map<number, string | null>;
  activeColumnId: number | null;
  onQuoteClick: (field: ReviewField) => void;
  onSetValue: (columnId: number, value: string | null) => void;
}

export default function ExtractedValuesTable({
  fields,
  edits,
  activeColumnId,
  onQuoteClick,
  onSetValue,
}: ExtractedValuesTableProps) {
  if (fields.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 6,
          textAlign: "center",
          borderRadius: 2,
          borderStyle: "dashed",
          bgcolor: "surface.sunken",
        }}
      >
        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
          Nothing extracted for this document yet.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {fields.map((field) => (
        <ExtractedValueRowItem
          key={field.column_id}
          field={field}
          pendingValue={
            edits.has(field.column_id)
              ? edits.get(field.column_id)
              : undefined
          }
          active={activeColumnId === field.column_id}
          onQuoteClick={onQuoteClick}
          onSetValue={onSetValue}
        />
      ))}
    </Box>
  );
}
