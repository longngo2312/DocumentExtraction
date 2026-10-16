import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import DocumentCardGrid from "../components/document/DocumentCardGrid";
import Composer from "../components/query/Composer";
import SchemaCardGrid from "../components/schema/SchemaCardGrid";
import { useAuthStore } from "../stores/authStore";
import { useDocumentStore } from "../stores/documentStore";
import { useSchemaStore } from "../stores/schemaStore";

/** How many cards each dashboard tab shows before "Show all" takes over. */
const PREVIEW_COUNT = 5;

type DashboardTab = "documents" | "schemas";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [tab, setTab] = useState<DashboardTab>("documents");

  const documents = useDocumentStore((s) => s.documents);
  const documentsLoading = useDocumentStore((s) => s.loading);
  const documentsError = useDocumentStore((s) => s.error);
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);
  const removeDocument = useDocumentStore((s) => s.removeDocument);

  const schemas = useSchemaStore((s) => s.schemas);
  const schemasLoading = useSchemaStore((s) => s.loading);
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const removeSchema = useSchemaStore((s) => s.removeSchema);

  useEffect(() => {
    fetchDocuments();
    fetchSchema();
  }, [fetchDocuments, fetchSchema]);

  // Newest first, then trimmed — the dashboard is a glance, not the list page.
  const recentDocuments = [...documents]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, PREVIEW_COUNT);
  const recentSchemas = [...schemas]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, PREVIEW_COUNT);

  const showAll = tab === "documents" ? "/documents" : "/schemas";
  const firstLoad =
    tab === "documents"
      ? documentsLoading && documents.length === 0
      : schemasLoading && schemas.length === 0;

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}>
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        <Stack
          spacing={2}
          sx={{
            alignItems: "center",
            textAlign: "center",
            pt: { xs: 6, md: 10 },
            pb: { xs: 4, md: 6 },
          }}
        >
          <Typography variant="h3" component="h1">
            What&apos;s on your mind
            {user?.username && (
              <>
                ,{" "}
                <Box component="span" sx={{ color: "primary.main" }}>
                  {user.username}
                </Box>
              </>
            )}
            ?
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 560 }}
          >
            Ask across everything you have extracted, or drop in a new document
            to pull its values out.
          </Typography>

          <Box sx={{ width: "100%", maxWidth: 720, pt: 1 }}>
            {/* The composer does not answer here — it hands the question to
                the query page, which owns the conversation and its history. */}
            <Composer
              placeholder="Ask across your documents, or describe what to extract…"
              onSend={(question) =>
                navigate("/query", { state: { question } })
              }
            />
          </Box>
        </Stack>

        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 4 }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 2.5,
              flexWrap: "wrap",
            }}
          >
            <Tabs
              value={tab}
              onChange={(_event, value) => setTab(value as DashboardTab)}
              aria-label="Recent work"
              sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36 } }}
            >
              <Tab value="documents" label="Recent documents" />
              <Tab value="schemas" label="Schemas" />
            </Tabs>

            <Button
              component={RouterLink}
              to={showAll}
              endIcon={<ArrowForwardIcon />}
              size="small"
            >
              Show all
            </Button>
          </Stack>

          {documentsError && tab === "documents" && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={() => fetchDocuments()}>
                  Retry
                </Button>
              }
            >
              {documentsError}
            </Alert>
          )}

          {firstLoad ? (
            <Stack direction="row" spacing={2}>
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} variant="rounded" height={220} sx={{ flex: 1 }} />
              ))}
            </Stack>
          ) : tab === "documents" ? (
            <DocumentCardGrid
              documents={recentDocuments}
              onDelete={(document) => removeDocument(document.id)}
            />
          ) : (
            <SchemaCardGrid
              schemas={recentSchemas}
              onDelete={removeSchema}
              loading={schemasLoading}
            />
          )}
        </Paper>
      </Container>
    </Box>
  );
}
