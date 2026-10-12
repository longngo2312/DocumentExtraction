import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  Avatar,
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import ThemeModeToggle from "./ThemeModeToggle";

interface ProfileMenuProps {
  collapsed?: boolean;
  /** Called after any navigation, so a mobile drawer can close itself. */
  onNavigate?: () => void;
}

export default function ProfileMenu({
  collapsed = false,
  onNavigate,
}: ProfileMenuProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const initials = user?.username?.[0]?.toUpperCase() ?? "?";

  async function handleLogout() {
    setAnchorEl(null);
    // Await so the refresh token is revoked before we leave the page.
    await logout();
    navigate("/login");
  }

  const trigger = (
    <Stack
      direction="row"
      spacing={1.25}
      onClick={(event) => setAnchorEl(event.currentTarget)}
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={Boolean(anchorEl)}
      aria-label="Account menu"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setAnchorEl(event.currentTarget);
        }
      }}
      sx={{
        alignItems: "center",
        minHeight: 44,
        px: collapsed ? 0 : 1,
        borderRadius: 1.5,
        cursor: "pointer",
        justifyContent: collapsed ? "center" : "flex-start",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Avatar
        sx={{
          width: 30,
          height: 30,
          fontSize: 13,
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        {initials}
      </Avatar>
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {user?.username}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {user?.email}
          </Typography>
        </Box>
      )}
    </Stack>
  );

  return (
    <>
      {collapsed ? (
        <Tooltip title={user?.username ?? "Account"} placement="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: -0.5 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user?.username}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
            Theme
          </Typography>
          <ThemeModeToggle />
        </Box>

        <Divider />

        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            navigate("/profile");
            onNavigate?.();
          }}
        >
          <ListItemIcon>
            <AccountCircleOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Account" />
        </MenuItem>

        <MenuItem onClick={handleLogout} aria-label="Log out">
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </>
  );
}
