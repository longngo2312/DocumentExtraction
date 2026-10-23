import { Alert, Box, Button, Paper, Skeleton, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import DocumentCardGrid from "../components/document/DocumentCardGrid";
import RenderDocuments from "../components/document/RenderDocuments";
import CollectionToolbar from "../components/layout/CollectionToolbar";
import type {
  CollectionSort,
  CollectionView,
} from "../components/layout/CollectionToolbar";
import { CARD_GRID } from "../components/layout/cardGrid";
import PageShell from "../components/layout/PageShell";
import { useDocumentStore } from "../stores/documentStore";

export default function DocumentGridPage() {
  const documents = useDocumentStore((s) => s.documents);
  const loading = useDocumentStore((s) => s.loading);
  const error = useDocumentStore((s) => s.error);
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);
  const removeDocument = useDocumentStore((s) => s.removeDocument);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recent");
  const [view, setView] = useState<CollectionView>("grid");

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle
      ? documents.filter(
          (document) =>
            document.filename.toLowerCase().includes(needle) ||
            document.schema_name.toLowerCase().includes(needle),
        )
      : documents;

    // Copy before sorting — the store's array is shared state.
    return [...matched].sort((a, b) =>
      sort === "name"
        ? a.filename.localeCompare(b.filename)
        : b.uploaded_at.localeCompare(a.uploaded_at),
    );
  }, [documents, search, sort]);

  const firstLoad = loading && documents.length === 0;

  return (
    <PageShell
      title="Documents"
      subtitle={`${documents.length} total`}
      maxWidth="lg"
    >
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => fetchDocuments()}>
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
        searchPlaceholder="Search documents…"
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
      />

      {firstLoad ? (
        <Box sx={CARD_GRID}>
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} variant="rounded" height={220} />
          ))}
        </Box>
      ) : visible.length === 0 && search ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography color="text.secondary">
            No documents match “{search}”.
          </Typography>
        </Paper>
      ) : view === "grid" ? (
        <DocumentCardGrid
          documents={visible}
          onDelete={(document) => removeDocument(document.id)}
        />
      ) : (
        <RenderDocuments
          documents={visible}
          onDelete={(document) => removeDocument(document.id)}
        />
      )}
    </PageShell>
  );
}
