import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { SchemaDetail } from "../../types";

function parseEnumOptions(raw: unknown): string {
  if (!raw) return "—";
  if (Array.isArray(raw)) return raw.join(", ");
  // `SELECT *` hands enum_options back as the raw JSON string.
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed.join(", ") : String(raw);
  } catch {
    return String(raw);
  }
}

const HEADS = ["Name", "Type", "Required", "Description", "Enum Options"];

interface RenderSchemaGridProps {
  schema: SchemaDetail;
}

/** Read-only columns table. Page chrome lives in SchemaDetailPage, not here. */
export default function RenderSchemaGrid({ schema }: RenderSchemaGridProps) {
  return (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Columns ({schema.schemaColumns.length})
      </Typography>

      {schema.schemaColumns.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No columns defined.</Typography>
        </Paper>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow>
                  {HEADS.map((head) => (
                    <TableCell key={head} scope="col" sx={{ fontWeight: 700 }}>
                      {head}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {schema.schemaColumns.map((col) => (
                  <TableRow key={col.id} hover>
                    <TableCell>{col.name}</TableCell>
                    <TableCell>
                      <Chip label={col.data_type} size="small" />
                    </TableCell>
                    <TableCell>{col.required ? "Yes" : "—"}</TableCell>
                    <TableCell>{col.description || "—"}</TableCell>
                    <TableCell>{parseEnumOptions(col.enum_options)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </>
  );
}
