import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SchemaOutlinedIcon from "@mui/icons-material/SchemaOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { Box, Divider, IconButton, List, Stack, Tooltip } from "@mui/material";
import Brand from "./Brand";
import NavItem from "./NavItem";
import ProfileMenu from "./ProfileMenu";

/** Layout needs these to offset the content region — keep them here. */
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

const LINKS = [
  { to: "/schemas", label: "Schemas", icon: <SchemaOutlinedIcon /> },
  { to: "/upload", label: "Upload", icon: <UploadFileOutlinedIcon /> },
  { to: "/documents", label: "Documents", icon: <DescriptionOutlinedIcon /> },
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
  return (
    <Stack
      sx={{
        height: "100%",
        bgcolor: "surface.sunken",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          px: collapsed ? 1.5 : 2,
          py: 2,
          display: "flex",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <Brand showWordmark={!collapsed} />
      </Box>

      <List sx={{ px: 1, flexGrow: 1 }}>
        {LINKS.map((link) => (
          <Box key={link.to} sx={{ mb: 0.5 }}>
            <NavItem {...link} collapsed={collapsed} onNavigate={onNavigate} />
          </Box>
        ))}
      </List>

      {showCollapseToggle && (
        <Box sx={{ px: 1, pb: 1, display: "flex", justifyContent: collapsed ? "center" : "flex-end" }}>
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Divider />

      <Box sx={{ p: 1 }}>
        <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
      </Box>
    </Stack>
  );
}
