import DeleteIcon from "@mui/icons-material/Delete";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import ContentCard from "../layout/ContentCard";
import { CARD_GRID } from "../layout/cardGrid";
import NewItemCard from "../layout/NewItemCard";
import type { DocumentSchema } from "../../types";
import { formatRelative } from "../../utils/format";

/**
 * A schema's preview is its shape: stacked bars standing in for columns, so a
 * two-column schema and a twelve-column one are told apart at a glance.
 */
function ColumnsPreview({ count }: { count: number }) {
  const bars = Math.min(count, 5);

  return (
    <Stack spacing={0.75} sx={{ width: "62%" }}>
      {Array.from({ length: Math.max(bars, 1) }, (_, index) => (
        <Box
          key={index}
          sx={{
            height: 7,
            borderRadius: 1,
            bgcolor: "divider",
            // Ragged right edge — equal bars read as a loading skeleton.
            width: `${100 - index * 11}%`,
          }}
        />
      ))}
      {count > bars && (
        <Typography variant="overline" color="text.secondary">
          +{count - bars} more
        </Typography>
      )}
    </Stack>
  );
}

interface SchemaCardGridProps {
  schemas: DocumentSchema[];
  onDelete: (id: number) => void;
  loading?: boolean;
}

export default function SchemaCardGrid({
  schemas,
  onDelete,
  loading = false,
}: SchemaCardGridProps) {
  const navigate = useNavigate();

  // Only a first load shows skeletons; a refresh keeps the existing cards up
  // so the page doesn't blink on every mutation.
  if (loading && schemas.length === 0) {
    return (
      <Box sx={CARD_GRID}>
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} variant="rounded" height={220} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={CARD_GRID}>
      <NewItemCard to="/schemas/new" label="New schema" />

      {schemas.map((schema) => (
        <ContentCard
          key={schema.id}
          to={`/schemas/${schema.id}`}
          title={schema.name}
          meta={`${schema.column_count} column${schema.column_count === 1 ? "" : "s"} · ${formatRelative(schema.updated_at)}`}
          preview={<ColumnsPreview count={schema.column_count} />}
          menu={(close) => [
            <MenuItem
              key="edit"
              onClick={() => {
                close();
                navigate(`/schemas/${schema.id}/edit`);
              }}
            >
              <ListItemIcon>
                <EditOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Edit" />
            </MenuItem>,
            <MenuItem
              key="delete"
              onClick={() => {
                close();
                onDelete(schema.id);
              }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText primary="Delete" />
            </MenuItem>,
          ]}
        />
      ))}
    </Box>
  );
}
