import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { DocumentSchema } from "../../types";

interface RenderSchemasProps {
  schemas: DocumentSchema[];
  onDelete: (id: number) => void;
  loading?: boolean;
}

const GRID = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
  gap: 2,
};

export default function RenderSchemas({
  schemas,
  onDelete,
  loading = false,
}: RenderSchemasProps) {
  // Only a first load shows skeletons; a refresh keeps the existing cards up so
  // the page doesn't blink on every mutation.
  if (loading && schemas.length === 0) {
    return (
      <Box sx={GRID}>
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} variant="rounded" height={104} />
        ))}
      </Box>
    );
  }

  if (schemas.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          No schemas yet. Click <strong>New Schema</strong> to create one.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={GRID}>
      {schemas.map((schema) => (
        <Card key={schema.id} variant="outlined" sx={{ position: "relative" }}>
          {/* CardActionArea, not a div with onClick — the old rows could not be
              reached or activated from the keyboard at all. */}
          <CardActionArea
            component={RouterLink}
            to={`/schemas/${schema.id}`}
            sx={{ p: 2, height: "100%", alignItems: "flex-start" }}
          >
            <Stack spacing={1} sx={{ width: "100%" }}>
              <Typography variant="subtitle1" noWrap sx={{ pr: 4 }}>
                {schema.name}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: 34,
                }}
              >
                {schema.description ?? "—"}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip
                  label={`${schema.column_count} col${schema.column_count !== 1 ? "s" : ""}`}
                  size="small"
                />
                <Typography variant="caption" color="text.secondary">
                  {new Date(schema.created_at).toLocaleDateString()}
                </Typography>
              </Stack>
            </Stack>
          </CardActionArea>

          {/* Outside the action area — a button inside a link is invalid and
              makes the delete unreachable by keyboard. */}
          <Tooltip title="Delete schema">
            <IconButton
              color="error"
              aria-label={`Delete schema ${schema.name}`}
              onClick={() => onDelete(schema.id)}
              sx={{ position: "absolute", top: 8, right: 8 }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Card>
      ))}
    </Box>
  );
}
