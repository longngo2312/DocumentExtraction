import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Link,
  OutlinedInput,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link as RouterLink, useBlocker, useNavigate, useParams } from "react-router-dom";
import { createDocumentSchema, getSchema, updateSchema } from "../api/schema";
import PageShell from "../components/layout/PageShell";
import FieldRow, { FieldListHeader } from "../components/schema/FieldRow";
import type { ColumnDraft, DraftRow, RowErrors } from "../components/schema/schemaDraft";
import {
  newRow,
  snapshot,
  toDraftRow,
  toPayload,
  validateDraft,
} from "../components/schema/schemaDraft";
import { useSchemaStore } from "../stores/schemaStore";
import type { DocumentSchema, SchemaDetail } from "../types";

type Mode = "create" | "edit";

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** Wide enough for the field rows; under it the fields card scrolls sideways. */
const ROW_MIN_WIDTH = 500;

function fieldCount(n: number) {
  return `${n} field${n === 1 ? "" : "s"}`;
}

/** `null` leaves the title alone — the form sets its own once it renders. */
function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = `${title} · DocExtract`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

interface Loaded {
  id: number;
  data?: SchemaDetail;
  error?: string;
}

/**
 * `/schemas/new` and `/schemas/:id/edit`. This part resolves the route — a
 * valid id, the schema loaded — and hands a settled starting point to
 * SchemaForm, which owns the editing.
 */
export default function SchemaEditorPage({ mode }: { mode: Mode }) {
  const { id } = useParams();
  const isNew = mode === "create";
  const schemaId = Number(id);
  const validId = isNew || (Number.isInteger(schemaId) && schemaId > 0);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isNew || !validId) return;
    let cancelled = false;
    getSchema(schemaId)
      .then((data) => {
        if (!cancelled) setLoaded({ id: schemaId, data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            id: schemaId,
            error: err instanceof Error ? err.message : "This schema could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [schemaId, isNew, validId, attempt]);

  useDocumentTitle(isNew || loaded?.data ? null : "Edit schema");

  if (!validId) {
    return (
      <PageShell title="Schema">
        <Alert severity="error" sx={{ mb: 2 }}>
          That is not a valid schema id.
        </Alert>
        <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
          Back to schemas
        </Button>
      </PageShell>
    );
  }

  if (isNew) return <SchemaForm key="new" mode="create" />;

  if (!loaded || loaded.id !== schemaId) return <EditorSkeleton />;

  if (!loaded.data) {
    return (
      <PageShell title="Edit schema">
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setLoaded(null);
                setAttempt((n) => n + 1);
              }}
            >
              Retry
            </Button>
          }
        >
          {loaded.error}
        </Alert>
        <Button component={RouterLink} to="/schemas" startIcon={<ArrowBackIcon />}>
          Back to schemas
        </Button>
      </PageShell>
    );
  }

  return <SchemaForm key={schemaId} mode="edit" schema={loaded.data} />;
}

function EditorSkeleton() {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Box role="status" aria-label="Loading schema">
        <Skeleton width={160} height={20} />
        <Skeleton width={260} height={44} />
        <Skeleton width={380} height={22} sx={{ mb: 3.5 }} />
        <Skeleton variant="rounded" height={200} sx={{ mb: 3.5 }} />
        <Skeleton variant="rounded" height={260} />
      </Box>
    </Container>
  );
}

interface SchemaFormProps {
  mode: Mode;
  /** The saved schema, in edit mode. */
  schema?: SchemaDetail;
}

function SchemaForm({ mode, schema }: SchemaFormProps) {
  const isNew = mode === "create";
  const navigate = useNavigate();
  const refreshList = useSchemaStore((s) => s.fetchSchema);

  const [initial] = useState(() => {
    const rows = schema ? schema.schemaColumns.map(toDraftRow) : [newRow()];
    const description = schema?.description ?? "";
    return {
      name: schema?.name ?? "",
      description,
      rows,
      baseline: snapshot(schema?.name ?? "", description, rows),
    };
  });
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [rows, setRows] = useState<DraftRow[]>(initial.rows);
  const [baseline, setBaseline] = useState(initial.baseline);
  const [savedName, setSavedName] = useState(initial.name);

  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [failedSaves, setFailedSaves] = useState(0);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [serverError, setServerError] = useState("");
  const [announcement, setAnnouncement] = useState({ key: 0, text: "" });
  const [confirmRemove, setConfirmRemove] = useState<DraftRow | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  /** Where focus goes once the rows have re-rendered: a row's name input, or Add field. */
  const pendingFocus = useRef<string | null>(null);
  /** Set just before a navigation the unsaved-changes guard should let through. */
  const leaving = useRef(false);

  const errors = validateDraft(name, rows);
  const namedCount = rows.filter((row) => row.name.trim()).length;
  const dirty = snapshot(name, description, rows) !== baseline;
  const canSave = Boolean(name.trim()) && namedCount > 0 && !saving && (isNew || dirty);
  const backTo = isNew ? "/schemas" : `/schemas/${schema!.id}`;

  const shows = (key: string) => submitted || touched.has(key);
  const nameError = shows("name") ? errors.name : undefined;
  const rowErrors = (uid: string): RowErrors | undefined => {
    const found = errors.rows[uid];
    if (!found) return undefined;
    return {
      name: shows(`${uid}:name`) ? found.name : undefined,
      options: shows(`${uid}:options`) ? found.options : undefined,
    };
  };

  // Errors on screen right now — the status line must never say "Ready"
  // beside a field that is showing one.
  const shownErrors =
    (nameError ? 1 : 0) +
    rows.reduce((n, row) => {
      const shown = rowErrors(row.uid);
      return n + (shown?.name ? 1 : 0) + (shown?.options ? 1 : 0);
    }, 0);

  useDocumentTitle(isNew ? "New schema" : `Edit ${savedName}`);

  // Leaving with unsaved edits: in-app navigation asks first, a reload or a
  // closed tab gets the browser's own prompt.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    // `leaving` covers the gap between a successful create's redirect and
    // this form unmounting — the URL changes before the new route commits.
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    (target === "add" ? addButtonRef.current : nameInputs.current.get(target))?.focus();
  }, [rows]);

  // After a refused save, the errors are on screen; take the user to the first.
  useEffect(() => {
    if (!failedSaves) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedSaves]);

  const announce = (text: string) => setAnnouncement((a) => ({ key: a.key + 1, text }));
  const touch = (key: string) =>
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  function updateRow(uid: string, patch: Partial<ColumnDraft>) {
    setRows((prev) => prev.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  }

  function addField() {
    const row = newRow();
    pendingFocus.current = row.uid;
    setRows([...rows, row]);
    announce(`Field ${rows.length + 1} added. ${fieldCount(rows.length + 1)}.`);
  }

  function removeRow(uid: string) {
    const index = rows.findIndex((row) => row.uid === uid);
    const next = rows.filter((row) => row.uid !== uid);
    pendingFocus.current = next[index]?.uid ?? "add";
    setRows(next);
    announce(`Field removed. ${fieldCount(next.length)}.`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    if (errors.count > 0) {
      setSubmitted(true);
      setFailedSaves((n) => n + 1);
      const problems = [
        ...(errors.name ? [errors.name] : []),
        ...rows.flatMap((row, i) =>
          Object.values(errors.rows[row.uid] ?? {}).map((msg) => `Field ${i + 1}: ${msg}`),
        ),
      ];
      announce(
        `Can't save yet: ${problems.length} problem${problems.length === 1 ? "" : "s"}. ${problems.join(" ")}`,
      );
      return;
    }

    setSaving(true);
    setServerError("");
    try {
      if (isNew) {
        const created = (await createDocumentSchema(
          name.trim(),
          description,
          toPayload(rows),
        )) as DocumentSchema;
        leaving.current = true;
        refreshList();
        navigate(`/schemas/${created.id}`, { replace: true });
        return;
      }

      const saved = await updateSchema(schema!.id, {
        name: name.trim(),
        description,
        columns: toPayload(rows),
      });
      // The server's copy is the truth (new columns now have ids); the uids
      // stay so no row remounts under the user.
      const nextRows = saved.columns.map((col, i) => ({
        ...toDraftRow(col),
        uid: rows[i]?.uid ?? crypto.randomUUID(),
      }));
      const nextDescription = saved.description ?? "";
      setRows(nextRows);
      setName(saved.name);
      setDescription(nextDescription);
      setBaseline(snapshot(saved.name, nextDescription, nextRows));
      setSavedName(saved.name);
      setSubmitted(false);
      setTouched(new Set());
      setJustSaved(true);
      refreshList();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  let status: { text: string; color: string };
  if (saving) status = { text: "Saving…", color: "text.secondary" };
  else if (serverError) status = { text: `Couldn't save: ${serverError}`, color: "error.main" };
  else if (shownErrors > 0)
    status = {
      text: `Fix ${shownErrors} problem${shownErrors === 1 ? "" : "s"} before saving.`,
      color: "error.main",
    };
  else if (!name.trim()) status = { text: "Add a schema name to continue.", color: "text.secondary" };
  else if (namedCount === 0) status = { text: "Add at least one named field.", color: "text.secondary" };
  else if (isNew) status = { text: `Ready to save · ${fieldCount(namedCount)}`, color: "text.primary" };
  else if (dirty) status = { text: "Unsaved changes", color: "text.primary" };
  else if (justSaved) status = { text: "Schema saved.", color: "success.main" };
  else status = { text: "No changes", color: "text.secondary" };

  const labelSx = {
    color: "text.primary",
    fontSize: 14,
    fontWeight: 500,
    mb: 1,
    "&.Mui-focused": { color: "text.primary" },
    "& .MuiFormLabel-asterisk": { color: "error.main" },
  };

  return (
    <Box
      component="form"
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      aria-labelledby="schema-form-title"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        // `divider` is too faint to be an input's only edge; this is 3:1+.
        "& .MuiOutlinedInput-root:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline":
          { borderColor: "surface.control" },
        "& .MuiOutlinedInput-root:hover:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline":
          { borderColor: "text.secondary" },
        "& input::placeholder, & textarea::placeholder": { color: "text.secondary", opacity: 1 },
      }}
    >
      {/* The page's scroll region. The footer sits below it, never over it, so
          it can't hide whatever has focus. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
        <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 }, px: { xs: 2, sm: 3 } }}>
          <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1, fontSize: 13 }}>
            <Link component={RouterLink} to="/schemas" color="text.secondary" underline="hover">
              Schemas
            </Link>
            <Typography aria-current="page" sx={{ fontSize: 13, color: "text.primary" }}>
              {isNew ? "New" : savedName}
            </Typography>
          </Breadcrumbs>
          <Typography id="schema-form-title" variant="h4" component="h1">
            {isNew ? "New schema" : "Edit schema"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3.5 }}>
            Define the fields you want extracted from your documents.
          </Typography>

          <Stack spacing={3.5}>
            <Paper
              component="section"
              variant="outlined"
              aria-labelledby="schema-details-heading"
              sx={{ p: 3, borderRadius: 1.5 }}
            >
              <Typography id="schema-details-heading" component="h2" sx={VISUALLY_HIDDEN}>
                Details
              </Typography>
              <Stack spacing={2.25}>
                <FormControl required error={Boolean(nameError)} fullWidth>
                  <FormLabel htmlFor="schema-name" sx={labelSx}>
                    Schema name
                    <Box component="span" sx={VISUALLY_HIDDEN}>
                      {" "}
                      (required)
                    </Box>
                  </FormLabel>
                  <OutlinedInput
                    id="schema-name"
                    value={name}
                    placeholder="e.g. Resume"
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => touch("name")}
                    inputProps={{
                      "aria-required": true,
                      "aria-describedby": nameError ? "schema-name-error" : undefined,
                    }}
                    sx={{ height: 44, fontSize: 16 }}
                  />
                  {nameError && (
                    <FormHelperText id="schema-name-error" sx={{ mx: 0 }}>
                      {nameError}
                    </FormHelperText>
                  )}
                </FormControl>

                <FormControl fullWidth>
                  <FormLabel htmlFor="schema-description" sx={labelSx}>
                    Description{" "}
                    <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                      · optional
                    </Box>
                  </FormLabel>
                  <OutlinedInput
                    id="schema-description"
                    value={description}
                    placeholder="What kind of documents is this for?"
                    onChange={(e) => setDescription(e.target.value)}
                    // Fixed rows render a plain textarea, which the user can
                    // resize; minRows would auto-size and fight the handle.
                    multiline
                    rows={2}
                    sx={{ fontSize: 15, "& textarea": { resize: "vertical" } }}
                  />
                </FormControl>
              </Stack>
            </Paper>

            <Paper
              component="section"
              variant="outlined"
              aria-labelledby="schema-fields-heading"
              sx={{ borderRadius: 1.5, overflowX: "auto" }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1.25,
                  px: 3,
                  py: 2.25,
                  minWidth: ROW_MIN_WIDTH,
                  boxSizing: "border-box",
                  borderBottom: 1,
                  borderColor: "divider",
                }}
              >
                <Typography
                  id="schema-fields-heading"
                  component="h2"
                  sx={{ fontSize: 17, fontWeight: 600 }}
                >
                  Fields
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {fieldCount(rows.length)}
                </Typography>
              </Box>
              <FieldListHeader />
              <Box
                component="ol"
                aria-labelledby="schema-fields-heading"
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {rows.map((row, index) => (
                  <FieldRow
                    key={row.uid}
                    row={row}
                    position={index + 1}
                    errors={rowErrors(row.uid)}
                    onChange={(patch) => updateRow(row.uid, patch)}
                    onBlur={(field) => touch(`${row.uid}:${field}`)}
                    onRemove={() =>
                      // A saved field may already have extracted values;
                      // a new one has nothing to lose.
                      row.id !== undefined ? setConfirmRemove(row) : removeRow(row.uid)
                    }
                    nameRef={(el) => {
                      if (el) nameInputs.current.set(row.uid, el);
                      else nameInputs.current.delete(row.uid);
                    }}
                  />
                ))}
              </Box>
              <Button
                ref={addButtonRef}
                onClick={addField}
                startIcon={<AddIcon />}
                fullWidth
                sx={{
                  justifyContent: "flex-start",
                  px: 3,
                  py: 2,
                  minWidth: ROW_MIN_WIDTH,
                  borderRadius: 0,
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                Add field
              </Button>
            </Paper>
          </Stack>
        </Container>
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            py: 1.75,
            px: { xs: 2, sm: 3 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
          }}
        >
          <Typography
            role="status"
            aria-live="polite"
            sx={{ fontSize: 14, color: status.color, minWidth: 0 }}
          >
            {status.text}
          </Typography>
          <Stack direction="row" spacing={1.25} sx={{ ml: "auto" }}>
            <Button component={RouterLink} to={backTo} variant="outlined" color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!canSave}>
              {saving ? "Saving…" : isNew ? "Save schema" : "Save changes"}
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Add, remove and refused-save summaries. A fresh key re-announces
          even when the words repeat. */}
      <Box aria-live="polite" sx={VISUALLY_HIDDEN}>
        <span key={announcement.key}>{announcement.text}</span>
      </Box>

      <Dialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        aria-labelledby="remove-field-title"
        aria-describedby="remove-field-body"
      >
        <DialogTitle id="remove-field-title">
          Remove {confirmRemove?.name.trim() ? `“${confirmRemove.name.trim()}”` : "this field"}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-field-body">
            This field is saved, so documents using this schema may already have values
            extracted for it. Those values are deleted when you save.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)}>Keep field</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (confirmRemove) removeRow(confirmRemove.uid);
              setConfirmRemove(null);
            }}
          >
            Remove field
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        aria-labelledby="leave-title"
        aria-describedby="leave-body"
      >
        <DialogTitle id="leave-title">Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText id="leave-body">
            Your edits to this schema haven't been saved.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
          <Button color="error" variant="contained" onClick={() => blocker.proceed?.()}>
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
