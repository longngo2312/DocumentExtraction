import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import type { ColumnDataType } from "../../types";
import type { ColumnDraft } from "./schemaDraft";

const DATA_TYPES: ColumnDataType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "enum",
];

interface ColumnDraftCardProps {
  column: ColumnDraft;
  /** 1-based, for labels only. */
  position: number;
  canRemove: boolean;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onRemove: () => void;
  /** Set on the most recently added card so it can be focused and scrolled to. */
  innerRef?: (node: HTMLDivElement | null) => void;
}

export default function ColumnDraftCard({
  column,
  position,
  canRemove,
  onChange,
  onRemove,
  innerRef,
}: ColumnDraftCardProps) {
  const label = column.name.trim() || `column ${position}`;

  return (
    <Paper variant="outlined" sx={{ p: 2 }} ref={innerRef}>
      <Stack spacing={2}>
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          <TextField
            label="Column Name"
            value={column.name}
            onChange={(e) => onChange({ name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Data Type"
            select
            value={column.data_type}
            onChange={(e) =>
              onChange({ data_type: e.target.value as ColumnDataType })
            }
            sx={{ minWidth: 140 }}
          >
            {DATA_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title={canRemove ? "Remove column" : "A schema needs at least one column"}>
            <span>
              <IconButton
                onClick={onRemove}
                disabled={!canRemove}
                aria-label={`Remove ${label}`}
                sx={{ flexShrink: 0 }}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <TextField
          label="Description"
          value={column.description}
          onChange={(e) => onChange({ description: e.target.value })}
          fullWidth
        />

        {column.data_type === "enum" && (
          <TextField
            label="Enum Options (comma separated)"
            value={column.enum_options}
            onChange={(e) => onChange({ enum_options: e.target.value })}
            fullWidth
          />
        )}

        <FormControlLabel
          control={
            <Checkbox
              checked={column.required}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
          }
          label="Required"
        />
      </Stack>
    </Paper>
  );
}
