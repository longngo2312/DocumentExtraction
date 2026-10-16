import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import SchemaOutlinedIcon from "@mui/icons-material/SchemaOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import {
  Box,
  IconButton,
  List,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useDocumentStore } from "../../stores/documentStore";
import Brand from "./Brand";
import NavItem from "./NavItem";
import ProfileMenu from "./ProfileMenu";

/** Layout needs these to offset the content region — keep them here. */
export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

/** How many recent documents the rail lists before it stops. */
const RECENTS_COUNT = 5;

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: <GridViewOutlinedIcon /> },
  { to: "/documents", label: "Documents", icon: <DescriptionOutlinedIcon /> },
  { to: "/schemas", label: "Schemas", icon: <SchemaOutlinedIcon /> },
  { to: "/upload", label: "Upload", icon: <UploadFileOutlinedIcon /> },
  { to: "/query", label: "Query", icon: <ChatBubbleOutlineIcon /> },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Temporary (mobile) drawers close on navigation; the permanent one doesn't. */
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
}

export default function AppSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapseToggle = true,
}: AppSidebarProps) {
  const documents = useDocumentStore((s) => s.documents);

  // Whatever the store already holds — the rail does not fetch on its own, so
  // it costs nothing on pages that never load documents.
  const recents = [...documents]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, RECENTS_COUNT);

  return (
    <Stack sx={{ height: "100%", overflowX: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          px: collapsed ? 1 : 2,
          py: 2,
          gap: 1,
        }}
      >
        {collapsed && showCollapseToggle ? (
          // Collapsed, the mark *is* the control — there is no room for a
          // separate button, and a logo that silently does nothing wastes the
          // only affordance the rail has left. Hovering swaps in the sidebar
          // glyph so it reads as clickable before it is clicked.
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              aria-expanded={false}
              sx={{
                p: 0.5,
                position: "relative",
                "&:hover .brand-mark, &:focus-visible .brand-mark": {
                  opacity: 0,
                },
                "&:hover .expand-glyph, &:focus-visible .expand-glyph": {
                  opacity: 1,
                },
              }}
            >
              <Box
                className="brand-mark"
                sx={{ display: "flex", transition: "opacity 150ms ease" }}
              >
                <Brand showWordmark={false} />
              </Box>
              <Box
                className="expand-glyph"
                aria-hidden
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  opacity: 0,
                  transition: "opacity 150ms ease",
                }}
              >
                <ViewSidebarOutlinedIcon fontSize="small" />
              </Box>
            </IconButton>
          </Tooltip>
        ) : (
          <Brand showWordmark={!collapsed} />
        )}

        {showCollapseToggle && !collapsed && (
          <Tooltip title="Collapse sidebar">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              aria-expanded
            >
              <ViewSidebarOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* The account sits at the top, next to the brand it belongs to, rather
          than pinned to the floor away from everything it affects. */}
      <Box sx={{ px: collapsed ? 1 : 1.5, pb: 1.5 }}>
        <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
      </Box>

      <List sx={{ px: 1, py: 0 }}>
        {LINKS.map((link) => (
          <Box key={link.to} sx={{ mb: 0.5 }}>
            <NavItem {...link} collapsed={collapsed} onNavigate={onNavigate} />
          </Box>
        ))}
      </List>

      {!collapsed && recents.length > 0 && (
        <Box sx={{ px: 2.25, pt: 3, minHeight: 0, overflow: "auto" }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="div"
            sx={{ mb: 0.5 }}
          >
            Recents
          </Typography>
          <Stack spacing={0.25}>
            {recents.map((document) => (
              <Typography
                key={document.id}
                component={RouterLink}
                to={`/documents/${document.id}`}
                onClick={onNavigate}
                variant="body2"
                noWrap
                title={document.filename}
                sx={{
                  color: "text.secondary",
                  textDecoration: "none",
                  py: 0.5,
                  "&:hover": { color: "text.primary" },
                }}
              >
                {document.filename}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      <Box sx={{ flexGrow: 1 }} />
    </Stack>
  );
}
