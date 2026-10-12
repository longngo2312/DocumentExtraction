import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { createDocumentSchema, getSchema, updateSchema } from "../api/schema";
import PageShell from "../components/layout/PageShell";
import ColumnDraftCard from "../components/schema/ColumnDraftCard";
import type { ColumnDraft, DraftRow } from "../components/schema/schemaDraft";
import { newRow, toDraftRow, toPayload } from "../components/schema/schemaDraft";
import { useSchemaStore } from "../stores/schemaStore";
import type { DocumentSchema, SchemaDetail } from "../types";

interface Loaded {
  id: number;
  data?: SchemaDetail;
  error?: string;
}

interface SchemaEditorPageProps {
  /** Comes from the route, not the params — "new" is its own path. */
  mode: "create" | "edit";
}

/**
 * The full-page schema editor — there is no drawer. `/schemas/new` opens an
 * empty form; `/schemas/:id/edit` loads the schema and edits it. Saving returns
 * to the read-only grid at `/schemas/:id`.
 */
export default function SchemaEditorPage({ mode }: SchemaEditorPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = mode === "create";
  const schemaId = Number(id);
  const refreshList = useSchemaStore((s) => s.fetchSchema);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<DraftRow[]>([newRow()]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const focusNextRef = useRef(false);

  const validId = isNew || (Number.isInteger(schemaId) && schemaId > 0);

  const applyLoaded = useCallback((data: SchemaDetail) => {
    setName(data.name);
    setDescription(data.description ?? "");
    setColumns(
      data.schemaColumns.length > 0
        ? data.schemaColumns.map(toDraftRow)
        : [newRow()],
    );
    setDirty(false);
  }, []);

  useEffect(() => {
    if (isNew || !validId) return;
    const signal = { cancelled: false };
    getSchema(schemaId)
      .then((data) => {
        if (signal.cancelled) return;
        setLoaded({ id: schemaId, data });
        applyLoaded(data);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setLoaded({
          id: schemaId,
          error: err instanceof Error ? err.message : "Failed to load schema",
        });
      });
    return () => {
      signal.cancelled = true;
    };
  }, [schemaId, isNew, validId, applyLoaded]);

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  function updateColumn(uid: string, patch: Partial<ColumnDraft>) {
    setColumns((prev) =>
      prev.map((col) => (col.uid === uid ? { ...col, ...patch } : col)),
    );
    setDirty(true);
  }

  function addColumn() {
    focusNextRef.current = true;
    setColumns((prev) => [...prev, newRow()]);
    setDirty(true);
  }

  function removeColumn(uid: string) {
    setColumns((prev) => prev.filter((col) => col.uid !== uid));
    setDirty(true);
  }

  function attachNewColumn(node: HTMLDivElement | null) {
    if (!node || !focusNextRef.current) return;
    focusNextRef.current = false;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.querySelector<HTMLInputElement>("input")?.focus();
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Schema name is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = toPayload(columns);
      if (isNew) {
        const created = (await createDocumentSchema(
          name,
          description,
          payload,
        )) as DocumentSchema;
        setDirty(false);
        refreshList();
        // Land on the new schema's detail grid.
        navigate(`/schemas/${created.id}`, { replace: true });
      } else {
        await updateSchema(schemaId, { name, description, columns: payload });
        setDirty(false);
        refreshList();
        navigate(`/schemas/${schemaId}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isNew
            ? "Failed to create schema"
            : "Failed to update schema",
      );
    } finally {
      setSaving(false);
    }
  }

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

  if (!isNew && loaded?.id !== schemaId) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isNew && loaded?.error) {
    return (
      <PageShell title="Schema">
        <Alert severity="error" sx={{ mb: 2 }}>
          {loaded.error}
        </Alert>
        <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
          Back to Schemas
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={isNew ? "New schema" : `Edit ${name || "schema"}`}
      subtitle={
        isNew
          ? "Define the fields you want extracted from your documents."
          : dirty
            ? "Unsaved changes"
            : "Saved"
      }
      actions={
        <Stack direction="row" spacing={1}>
          <Button
            component={RouterLink}
            to={isNew ? "/schemas" : `/schemas/${schemaId}`}
            startIcon={<ArrowBackIcon />}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </Stack>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <TextField
              label="Schema Name"
              value={name}
              onChange={(e) => edit(setName)(e.target.value)}
              fullWidth
              autoFocus={isNew}
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => edit(setDescription)(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </Paper>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="subtitle1">
            Columns ({columns.length})
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addColumn}>
            Add Column
          </Button>
        </Box>

        {columns.map((col, index) => (
          <ColumnDraftCard
            key={col.uid}
            column={col}
            position={index + 1}
            canRemove={columns.length > 1}
            onChange={(patch) => updateColumn(col.uid, patch)}
            onRemove={() => removeColumn(col.uid)}
            innerRef={index === columns.length - 1 ? attachNewColumn : undefined}
          />
        ))}

        <Box sx={{ display: "flex", justifyContent: "flex-end", pb: 2 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save schema"}
          </Button>
        </Box>
      </Stack>
    </PageShell>
  );
}
