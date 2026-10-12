import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { getSchema } from "../api/schema";
import PageShell from "../components/layout/PageShell";
import RenderSchemaGrid from "../components/schema/RenderSchemaGrid";
import type { SchemaDetail } from "../types";

/** Tagged with the id it belongs to, so a stale response can't be shown. */
interface Result {
  id: number;
  data?: SchemaDetail;
  error?: string;
}

/** Read-only view of a schema. Editing happens on /schemas/:id/edit. */
export default function SchemaDetailPage() {
  const { id } = useParams();
  const schemaId = Number(id);
  const [result, setResult] = useState<Result | null>(null);

  const validId = Number.isInteger(schemaId) && schemaId > 0;

  useEffect(() => {
    if (!validId) return;
    const signal = { cancelled: false };
    getSchema(schemaId)
      .then((data) => {
        if (!signal.cancelled) setResult({ id: schemaId, data });
      })
      .catch((err: unknown) => {
        if (!signal.cancelled) {
          setResult({
            id: schemaId,
            error: err instanceof Error ? err.message : "Failed to load schema",
          });
        }
      });
    return () => {
      signal.cancelled = true;
    };
  }, [schemaId, validId]);

  if (!validId) {
    return (
      <PageShell title="Schema">
        <Alert severity="error" sx={{ mb: 2 }}>
          That is not a valid schema id.
        </Alert>
        <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
          Back to Schemas
        </Button>
      </PageShell>
    );
  }

  // Loading is derived from "the result I hold isn't for the id I want" rather
  // than a flag set inside the effect.
  if (result?.id !== schemaId) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (result.error || !result.data) {
    return (
      <PageShell title="Schema">
        <Alert severity="error" sx={{ mb: 2 }}>
          {result.error ?? "Schema not found"}
        </Alert>
        <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
          Back to Schemas
        </Button>
      </PageShell>
    );
  }

  const schema = result.data;

  return (
    <PageShell
      title={schema.name}
      subtitle={
        <Stack component="span" spacing={0.5}>
          {schema.description && <span>{schema.description}</span>}
          <Typography variant="caption" color="text.secondary" component="span">
            Created {new Date(schema.created_at).toLocaleDateString()}
          </Typography>
        </Stack>
      }
      actions={
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
            Back
          </Button>
          <Button
            component={RouterLink}
            to={`/schemas/${schemaId}/edit`}
            variant="contained"
            startIcon={<EditIcon />}
          >
            Edit Schema
          </Button>
        </Stack>
      }
    >
      <RenderSchemaGrid schema={schema} />
    </PageShell>
  );
}
