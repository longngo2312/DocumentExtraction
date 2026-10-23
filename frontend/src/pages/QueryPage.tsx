import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  askQuery,
  deleteChatSession,
  getChatSession,
  getQueryStatus,
  listChatSessions,
  type ChatSessionSummary,
  type QueryMessage,
  type QueryStatus,
} from "../api/query";
import ChatMessageList from "../components/query/ChatMessageList";
import ChatSessionList from "../components/query/ChatSessionList";
import Composer from "../components/query/Composer";
import EmptyChatState from "../components/query/EmptyChatState";
import SearchStatusBanner from "../components/query/SearchStatusBanner";

/** How often to re-read the status while documents are being indexed. */
const STATUS_POLL_MS = 5000;
/** Recent chats offered on the empty screen; the rest are in the history menu. */
const EMPTY_STATE_CHATS = 5;

/**
 * What a page hands this one in router state. Both are one-shot: `question`
 * from the dashboard composer, `messages` from this page itself when a first
 * answer creates a chat and the URL moves to it.
 */
interface Handoff {
  question?: string;
  messages?: QueryMessage[];
}

/**
 * Owns what outlives a single chat — the search status and the session list —
 * and renders the chat itself keyed by its id. A new key remounts ChatView
 * with fresh state, so switching chats needs no reset logic at all.
 */
export default function QueryPage() {
  const params = useParams<{ sessionId?: string }>();
  const sessionId = params.sessionId ? Number(params.sessionId) : null;
  const navigate = useNavigate();

  const [status, setStatus] = useState<QueryStatus | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);

  // Every setState sits in a .then, so none runs synchronously inside the
  // effects below.
  const refreshStatus = useCallback(() => {
    getQueryStatus()
      .then(setStatus)
      // An unreadable status is not worth a banner; a failing question will
      // still report its own error.
      .catch(() => setStatus(null));
  }, []);

  const refreshSessions = useCallback(() => {
    listChatSessions()
      .then(setSessions)
      .catch(() => {
        /* the lists just stay as they were */
      });
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshSessions();
  }, [refreshStatus, refreshSessions]);

  // Poll only while something is being indexed — that is the one state that
  // changes without the user doing anything.
  useEffect(() => {
    if (!status?.indexing) return;
    const timer = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [status?.indexing, refreshStatus]);

  const handleDelete = useCallback(
    (id: number) => {
      deleteChatSession(id)
        .then(() => {
          refreshSessions();
          // Deleting the open chat leaves nothing to show — start fresh.
          if (id === sessionId) navigate("/query", { replace: true });
        })
        .catch(() => refreshSessions());
    },
    [navigate, refreshSessions, sessionId],
  );

  const title =
    sessionId === null
      ? "New chat"
      : (sessions.find((session) => session.id === sessionId)?.title ?? "Chat");

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          gap: 1,
          px: { xs: 1.5, sm: 2 },
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Button
          color="inherit"
          startIcon={<HistoryIcon />}
          endIcon={<ExpandMoreIcon />}
          aria-haspopup="dialog"
          aria-expanded={Boolean(historyAnchor)}
          onClick={(event) => {
            refreshSessions();
            setHistoryAnchor(event.currentTarget);
          }}
          sx={{ minWidth: 0, maxWidth: { xs: "60%", sm: 420 }, fontWeight: 600 }}
        >
          {/* body2, not subtitle2: the theme uppercases subtitle2, and a chat
              title is the user's own sentence. */}
          <Typography
            variant="body2"
            noWrap
            component="span"
            title={title}
            sx={{ fontWeight: 600 }}
          >
            {title}
          </Typography>
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          component={RouterLink}
          to="/query"
          startIcon={<AddIcon />}
          size="small"
          variant="outlined"
          disabled={sessionId === null}
        >
          New chat
        </Button>
      </Stack>

      <Popover
        open={Boolean(historyAnchor)}
        anchorEl={historyAnchor}
        onClose={() => setHistoryAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: { sx: { width: 360, maxWidth: "calc(100vw - 32px)", maxHeight: 440, p: 1 } },
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
          Chat history
        </Typography>
        <ChatSessionList
          sessions={sessions}
          activeId={sessionId}
          onDelete={handleDelete}
          onNavigate={() => setHistoryAnchor(null)}
          emptyText="No past chats yet — your conversations will show up here."
        />
      </Popover>

      <ChatView
        key={sessionId ?? "new"}
        sessionId={sessionId}
        status={status}
        onStatusChanged={refreshStatus}
        recentSessions={sessions.slice(0, EMPTY_STATE_CHATS)}
        onAnswered={refreshSessions}
        onDeleteSession={handleDelete}
      />
    </Box>
  );
}

interface ChatViewProps {
  sessionId: number | null;
  status: QueryStatus | null;
  onStatusChanged: () => void;
  recentSessions: ChatSessionSummary[];
  onAnswered: () => void;
  onDeleteSession: (id: number) => void;
}

/** One conversation. Mounted fresh for every chat — see QueryPage. */
function ChatView({
  sessionId,
  status,
  onStatusChanged,
  recentSessions,
  onAnswered,
  onDeleteSession,
}: ChatViewProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Read once, at mount — the handoff is cleared from history straight after.
  const [handoff] = useState<Handoff>(() => (location.state as Handoff | null) ?? {});
  const [messages, setMessages] = useState<QueryMessage[]>(() => handoff.messages ?? []);
  const [loading, setLoading] = useState(sessionId !== null && !handoff.messages);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Router state survives a reload. Left in place, a reload would re-send the
  // dashboard's question or show a stale snapshot, so it is consumed once.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // An existing chat opened by URL or from a list: fetch its transcript.
  useEffect(() => {
    if (!loading || sessionId === null) return;
    let cancelled = false;
    getChatSession(sessionId)
      .then((session) => {
        if (cancelled) return;
        setMessages(session.messages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "This chat could not be opened");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, sessionId]);

  // Mirrors `messages` so the handoff to a newly created chat carries the
  // whole transcript without handleSend depending on it.
  const messagesRef = useRef<QueryMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // An answer can land after the user has moved to another chat. It is saved
  // on the server either way; it just must not drag them back to this one.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const handleSend = useCallback(
    async (question: string) => {
      const userMessage: QueryMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        citations: [],
      };
      setMessages((previous) => [...previous, userMessage]);
      setPending(true);
      setError(null);

      try {
        const answer = await askQuery(question, sessionId);
        if (!alive.current) return;
        onAnswered();

        if (sessionId === null) {
          // The first answer created the chat. Move to its URL so a reload or
          // a shared link reopens it, handing the transcript over so it does
          // not blink out and back while the new view mounts.
          navigate(`/query/${answer.session_id}`, {
            replace: true,
            state: { messages: [...messagesRef.current, answer] } satisfies Handoff,
          });
        } else {
          setMessages((previous) => [...previous, answer]);
        }
      } catch (err) {
        if (!alive.current) return;
        setError(err instanceof Error ? err.message : "Could not reach the query service");
      } finally {
        if (alive.current) setPending(false);
      }
    },
    [navigate, onAnswered, sessionId],
  );

  // Fire the dashboard's question exactly once. Without the ref StrictMode's
  // double-invoke in development sends it twice.
  const sentHandoff = useRef(false);
  useEffect(() => {
    if (handoff.question && !sentHandoff.current) {
      sentHandoff.current = true;
      handleSend(handoff.question);
    }
  }, [handoff.question, handleSend]);

  const isEmpty = messages.length === 0 && !pending && !loading;

  return (
    <>
      {/* The page's single scroll region — the transcript scrolls here,
          inside the content panel, and nothing else on the page scrolls. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
        <Container
          maxWidth="md"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 3,
            // Lets the empty state centre itself against the panel rather
            // than sitting at the top of a short page.
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Scrolls away with the conversation — it explains the state of
              search, not permanent chrome worth a strip of every screen. */}
          {status && (
            <Box sx={{ mb: 3 }}>
              <SearchStatusBanner status={status} onChanged={onStatusChanged} />
            </Box>
          )}

          {loading ? (
            <Box sx={{ flexGrow: 1, display: "grid", placeItems: "center" }}>
              <CircularProgress size={28} aria-label="Loading chat" />
            </Box>
          ) : loadError ? (
            <Alert
              severity="warning"
              action={
                <Button component={RouterLink} to="/query" color="inherit" size="small">
                  New chat
                </Button>
              }
            >
              {loadError}
            </Alert>
          ) : isEmpty ? (
            <>
              <EmptyChatState onPick={handleSend} />
              {recentSessions.length > 0 && (
                <Box sx={{ width: "100%", maxWidth: 560, mx: "auto", mt: 1 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
                    Recent chats
                  </Typography>
                  <ChatSessionList sessions={recentSessions} onDelete={onDeleteSession} />
                </Box>
              )}
            </>
          ) : (
            <ChatMessageList messages={messages} pending={pending} />
          )}
        </Container>
      </Box>

      {/* The composer floats on the panel rather than sitting on a full-bleed
          bar — the transcript runs under it and keeps the panel's ground. */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, pt: 1, pb: 2 }}>
        <Container maxWidth="md" disableGutters>
          <Stack spacing={1}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Composer
              onSend={handleSend}
              pending={pending}
              // With the vector store down every question fails — but only
              // after a model call. Better not to let one be asked. A chat that
              // failed to open has nowhere to send to.
              disabled={status?.qdrant === false || loading || Boolean(loadError)}
              autoFocus
              placeholder={
                messages.length === 0 ? "Ask about your documents…" : "Ask a follow-up…"
              }
            />
          </Stack>
        </Container>
      </Box>
    </>
  );
}
