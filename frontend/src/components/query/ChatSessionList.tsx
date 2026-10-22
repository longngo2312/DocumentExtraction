import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { ChatSessionSummary } from "../../api/query";
import { formatRelative } from "../../utils/format";

interface ChatSessionListProps {
  sessions: ChatSessionSummary[];
  /** The chat currently open, highlighted so the list reads as "you are here". */
  activeId?: number | null;
  onDelete: (id: number) => void;
  /** Called on open — the history popover closes itself through this. */
  onNavigate?: () => void;
  emptyText?: string;
}

/**
 * Past chats, newest first. The dashboard tab, the chat header's history
 * popover and the empty chat screen all render this, so a chat looks the same
 * wherever you find it.
 */
export default function ChatSessionList({
  sessions,
  activeId = null,
  onDelete,
  onNavigate,
  emptyText = "No chats yet.",
}: ChatSessionListProps) {
  if (sessions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1 }}>
        {emptyText}
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {sessions.map((session) => (
        <ListItem
          key={session.id}
          disablePadding
          // Outside the link: a button inside an anchor is invalid markup and
          // cannot be reached by keyboard.
          secondaryAction={
            <Tooltip title="Delete chat">
              <IconButton
                edge="end"
                size="small"
                aria-label={`Delete chat: ${session.title}`}
                onClick={() => onDelete(session.id)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <ListItemButton
            component={RouterLink}
            to={`/query/${session.id}`}
            onClick={onNavigate}
            selected={session.id === activeId}
            sx={{ borderRadius: 1.5, pr: 6 }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: "text.secondary" }}>
              <ChatBubbleOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={session.title}
              secondary={`${formatRelative(session.updated_at)} · ${session.message_count} message${session.message_count === 1 ? "" : "s"}`}
              slotProps={{
                primary: { noWrap: true, title: session.title, variant: "body2" },
                secondary: { noWrap: true },
              }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
