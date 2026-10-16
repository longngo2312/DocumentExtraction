import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import HistoryIcon from "@mui/icons-material/History";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SchemaOutlinedIcon from "@mui/icons-material/SchemaOutlined";
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
import { useEffect, useRef, useState } from "react";
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
  const panelRef = useRef<HTMLDivElement>(null);

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
          <Typography
            variant="h2"
            component="h1"
            sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem", md: "2.5rem" } }}
          >
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
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 520 }}
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

        {/* The scroll affordance from the reference: a quiet label pointing at
            what is below the fold. It scrolls rather than merely hinting. */}
        <Stack
          component="button"
          onClick={() =>
            panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          aria-label="Jump to recent work"
          sx={{
            display: "flex",
            // Label over chevron, as in the reference — the arrow points at
            // what is below, so it belongs under the word, not beside it.
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
            mx: "auto",
            mb: 3,
            px: 1.5,
            py: 0.5,
            border: 0,
            borderRadius: 2,
            bgcolor: "transparent",
            color: "text.disabled",
            cursor: "pointer",
            "&:hover": { color: "text.secondary" },
          }}
        >
          <Typography variant="overline" sx={{ color: "inherit" }}>
            Recent
          </Typography>
          <KeyboardArrowDownIcon fontSize="small" />
        </Stack>

        <Paper
          ref={panelRef}
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, borderRadius: 4, mb: 4 }}
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
            {/* Pill tabs, as in the reference — still MUI Tabs underneath, so
                arrow-key roving and the tab/panel semantics come for free. */}
            <Tabs
              value={tab}
              onChange={(_event, value) => setTab(value as DashboardTab)}
              aria-label="Recent work"
              sx={{
                minHeight: 0,
                "& .MuiTabs-indicator": { display: "none" },
                "& .MuiTabs-flexContainer": { gap: 0.5 },
                "& .MuiTab-root": {
                  minHeight: 36,
                  minWidth: 0,
                  px: 2,
                  gap: 0.75,
                  borderRadius: 999,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  color: "text.secondary",
                },
                "& .Mui-selected": {
                  bgcolor: "surface.activeRow",
                  color: "primary.main",
                },
              }}
            >
              <Tab
                value="documents"
                label="Recent documents"
                icon={<HistoryIcon fontSize="small" />}
                iconPosition="start"
              />
              <Tab
                value="schemas"
                label="Schemas"
                icon={<SchemaOutlinedIcon fontSize="small" />}
                iconPosition="start"
              />
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
              showNew={false}
            />
          ) : (
            <SchemaCardGrid
              schemas={recentSchemas}
              onDelete={removeSchema}
              loading={schemasLoading}
              showNew={false}
            />
          )}
        </Paper>
      </Container>
    </Box>
  );
}
