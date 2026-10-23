import AddIcon from "@mui/icons-material/Add";
import { Alert, Button, Paper, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import CollectionToolbar from "../components/layout/CollectionToolbar";
import type {
  CollectionSort,
  CollectionView,
} from "../components/layout/CollectionToolbar";
import PageShell from "../components/layout/PageShell";
import RenderSchemas from "../components/schema/RenderSchemas";
import SchemaCardGrid from "../components/schema/SchemaCardGrid";
import { useSchemaStore } from "../stores/schemaStore";

export default function SchemaBuilderPage() {
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const schemas = useSchemaStore((s) => s.schemas);
  const loading = useSchemaStore((s) => s.loading);
  const error = useSchemaStore((s) => s.error);
  const deleteSchema = useSchemaStore((s) => s.removeSchema);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recent");
  const [view, setView] = useState<CollectionView>("grid");

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle
      ? schemas.filter(
          (schema) =>
            schema.name.toLowerCase().includes(needle) ||
            (schema.description ?? "").toLowerCase().includes(needle),
        )
      : schemas;

    // Copy before sorting — the store's array is shared state.
    return [...matched].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updated_at.localeCompare(a.updated_at),
    );
  }, [schemas, search, sort]);

  return (
    <PageShell
      title="Schemas"
      subtitle="The columns each uploaded document gets extracted into."
      maxWidth="lg"
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

      <CollectionToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search schemas…"
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
      />

      {visible.length === 0 && search ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography color="text.secondary">
            No schemas match “{search}”.
          </Typography>
        </Paper>
      ) : view === "grid" ? (
        <SchemaCardGrid
          schemas={visible}
          onDelete={deleteSchema}
          loading={loading}
        />
      ) : (
        <RenderSchemas
          schemas={visible}
          onDelete={deleteSchema}
          loading={loading}
        />
      )}
    </PageShell>
  );
}
