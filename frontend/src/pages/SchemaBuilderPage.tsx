import AddIcon from "@mui/icons-material/Add";
import { Alert, Button } from "@mui/material";
import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import PageShell from "../components/layout/PageShell";
import RenderSchemas from "../components/schema/RenderSchemas";
import { useSchemaStore } from "../stores/schemaStore";

export default function SchemaBuilderPage() {
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const schemas = useSchemaStore((s) => s.schemas);
  const loading = useSchemaStore((s) => s.loading);
  const error = useSchemaStore((s) => s.error);
  const deleteSchema = useSchemaStore((s) => s.removeSchema);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return (
    <PageShell
      title="Schemas"
      subtitle="The columns each uploaded document gets extracted into."
      actions={
        <Button
          component={RouterLink}
          to="/schemas/new"
          variant="contained"
          startIcon={<AddIcon />}
        >
          New Schema
        </Button>
      }
    >
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => fetchSchema()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <RenderSchemas
        schemas={schemas}
        onDelete={deleteSchema}
        loading={loading}
      />
    </PageShell>
  );
}
