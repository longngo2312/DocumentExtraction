import { Alert, Box, Button, Skeleton } from "@mui/material";
import { useEffect } from "react";
import RenderDocuments from "../components/document/RenderDocuments";
import PageShell from "../components/layout/PageShell";
import { useDocumentStore } from "../stores/documentStore";

export default function DocumentGridPage() {
  const documents = useDocumentStore((s) => s.documents);
  const loading = useDocumentStore((s) => s.loading);
  const error = useDocumentStore((s) => s.error);
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);
  const removeDocument = useDocumentStore((s) => s.removeDocument);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const firstLoad = loading && documents.length === 0;

  return (
    <PageShell
      title="Documents"
      subtitle={`${documents.length} total`}
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

      {firstLoad ? (
        <Box>
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} height={48} sx={{ mb: 0.5 }} />
          ))}
        </Box>
      ) : (
        <RenderDocuments
          documents={documents}
          onDelete={(document) => removeDocument(document.id)}
        />
      )}
    </PageShell>
  );
}
