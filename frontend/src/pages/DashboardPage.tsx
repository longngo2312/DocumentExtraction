import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  deleteChatSession,
  listChatSessions,
  type ChatSessionSummary,
} from "../api/query";
import DocumentCardGrid from "../components/document/DocumentCardGrid";
import ChatSessionList from "../components/query/ChatSessionList";
import Composer from "../components/query/Composer";
import SchemaCardGrid from "../components/schema/SchemaCardGrid";
import { useAuthStore } from "../stores/authStore";
import { useDocumentStore } from "../stores/documentStore";
import { useSchemaStore } from "../stores/schemaStore";

/** How many cards each dashboard tab shows before "Show all" takes over. */
const PREVIEW_COUNT = 5;

/**
 * How much of the recent panel sits above the fold: its top padding plus the
 * tab row, and nothing more. The hero is sized against this, so the panel
 * always peeks by the same amount whatever the hero's own height works out to.
 */
const PANEL_PEEK = 90;

type DashboardTab = "documents" | "schemas" | "chats";

/** Where "Show all" goes and what an empty tab offers, per tab. */
const TAB_META: Record<
  DashboardTab,
  { showAll: string; empty: string; action: string; actionTo: string }
> = {
  documents: {
    showAll: "/documents",
    empty: "No documents yet.",
    action: "Upload a document",
    actionTo: "/upload",
  },
  schemas: {
    showAll: "/schemas",
    empty: "No schemas yet.",
    action: "New schema",
    actionTo: "/schemas/new",
  },
  // The query page holds the full history behind its header menu.
  chats: {
    showAll: "/query",
    empty: "No chats yet.",
    action: "Start a chat",
    actionTo: "/query",
  },
};

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

  const [chats, setChats] = useState<ChatSessionSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const refreshChats = useCallback(() => {
    listChatSessions()
      .then(setChats)
      .catch(() => {
        /* the tab just shows what it had */
      })
      .finally(() => setChatsLoading(false));
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchSchema();
    refreshChats();
  }, [fetchDocuments, fetchSchema, refreshChats]);

  // Newest first, then trimmed — the dashboard is a glance, not the list page.
  const recentDocuments = [...documents]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, PREVIEW_COUNT);
  const recentSchemas = [...schemas]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, PREVIEW_COUNT);

  const recentChats = chats.slice(0, PREVIEW_COUNT);

  const meta = TAB_META[tab];
  const isEmpty = {
    documents: recentDocuments.length === 0,
    schemas: recentSchemas.length === 0,
    chats: recentChats.length === 0,
  }[tab];
  const firstLoad = {
    documents: documentsLoading && documents.length === 0,
    schemas: schemasLoading && schemas.length === 0,
    chats: chatsLoading && chats.length === 0,
  }[tab];

  return (
    // The dashboard is the one screen that floats: a recessed ground with a
    // rounded panel inset on it. Every other page sits flat on the canvas, so
    // this lives here rather than in the shell. Full-bleed on a phone — an
    // inset frame there is just lost width.
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        bgcolor: "surface.sunken",
        // An even 8px gutter on every side, the left included — the card is
        // inset from the rail, not flush against it.
        p: { xs: 0, md: 1 },
      }}
    >
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // The card clips and stays put; the scroller inside it is what
          // moves, so the rounded corners never crop a scrollbar.
          overflow: "hidden",
          bgcolor: "background.default",
          border: { xs: 0, md: 1 },
          borderColor: { md: "divider" },
          borderRadius: { xs: 0, md: 2 },
          boxShadow: { xs: 0, md: 3 },
        }}
      >
        <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
        {/* The hero takes the panel's height less the peek, so the recent
            panel always starts just below the fold with only its tab row
            showing. A direct child of the scroller, because that is the only
            ancestor with a definite height for the percentage to resolve
            against. */}
        <Box
          sx={{
            minHeight: `calc(100% - ${PANEL_PEEK}px)`,
            display: "flex",
            flexDirection: "column",
          }}
        >
        <Container
          maxWidth="lg"
          sx={{
            px: { xs: 2, sm: 3 },
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
        <Stack
          spacing={2}
          sx={{
            alignItems: "center",
            textAlign: "center",
            py: { xs: 4, md: 6 },
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
        </Container>

        {/* The scroll affordance from the reference: a quiet label pointing at
            what is below the fold. It scrolls rather than merely hinting.
            Sits at the foot of the hero, directly above the peeking panel. */}
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
            mb: 2,
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
        </Box>

        <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 }, pb: 2.5 }}>
        <Paper
          ref={panelRef}
          variant="outlined"
          sx={{
            py: 3,
            px: { xs: 2, sm: 4.5 },
            borderRadius: 2,
            // Cast upward: the panel rises from below the fold, so the light
            // it blocks is above it.
            boxShadow: "0 -4px 32px rgba(0,0,0,0.3)",
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 5,
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
                  minHeight: 34,
                  minWidth: 0,
                  px: 1.75,
                  gap: 1,
                  borderRadius: 1.5,
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  color: "text.secondary",
                  // Transparent rather than absent, so gaining the selected
                  // border does not nudge the row by a pixel.
                  border: "1px solid transparent",
                  "& .MuiSvgIcon-root": { fontSize: 16 },
                  "&:hover": { color: "text.primary" },
                },
                "& .Mui-selected": {
                  bgcolor: "surface.activeRow",
                  color: "primary.main",
                  borderColor: "primary.main",
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
              <Tab
                value="chats"
                label="Recent chats"
                icon={<ChatBubbleOutlineIcon fontSize="small" />}
                iconPosition="start"
              />
            </Tabs>

            <Button
              component={RouterLink}
              to={meta.showAll}
              endIcon={<ArrowForwardIcon />}
              size="small"
              sx={{ fontWeight: 600, flexShrink: 0 }}
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

          {/* The panel keeps its shape whatever the state — loading, empty or
              full. Without a floor the bar above collapses onto nothing the
              first time someone signs in, which is exactly when it matters. */}
          <Box sx={{ minHeight: 248 }}>
            {firstLoad && tab === "chats" ? (
              <Stack spacing={1}>
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} variant="rounded" height={52} />
                ))}
              </Stack>
            ) : firstLoad ? (
              <Stack direction="row" spacing={2}>
                {[0, 1, 2].map((n) => (
                  <Skeleton
                    key={n}
                    variant="rounded"
                    height={220}
                    sx={{ flex: 1 }}
                  />
                ))}
              </Stack>
            ) : isEmpty ? (
              <Stack
                spacing={1.5}
                sx={{
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  height: 248,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {meta.empty}
                </Typography>
                <Button
                  component={RouterLink}
                  to={meta.actionTo}
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                >
                  {meta.action}
                </Button>
              </Stack>
            ) : tab === "chats" ? (
              <ChatSessionList
                sessions={recentChats}
                onDelete={(id) => {
                  deleteChatSession(id).finally(refreshChats);
                }}
              />
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
          </Box>
          </Paper>
        </Container>
        </Box>
      </Box>
    </Box>
  );
}
