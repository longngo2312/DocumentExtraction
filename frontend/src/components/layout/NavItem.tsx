import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface NavItemProps {
  to: string;
  label: string;
  icon: ReactNode;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export default function NavItem({
  to,
  label,
  icon,
  collapsed = false,
  onNavigate,
}: NavItemProps) {
  const button = (
    <ListItemButton
      component={NavLink}
      to={to}
      onClick={onNavigate}
      // The tooltip carries the label visually when collapsed, but a tooltip
      // title does not reliably announce — so label the link either way.
      aria-label={label}
      sx={{
        minHeight: 44,
        borderRadius: 1.5,
        px: collapsed ? 1.5 : 1.75,
        justifyContent: collapsed ? "center" : "flex-start",
        color: "text.secondary",
        position: "relative",
        "&:hover": { bgcolor: "action.hover" },
        "&.active": {
          bgcolor: "surface.activeRow",
          color: "primary.main",
          "& .MuiListItemIcon-root": { color: "primary.main" },
          "& .MuiListItemText-primary": { fontWeight: 600 },
          // Leading bar — the actual active signal. Weight alone reads as noise.
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 3,
            bgcolor: "primary.main",
          },
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 0,
          mr: collapsed ? 0 : 1.75,
          color: "inherit",
          justifyContent: "center",
        }}
      >
        {icon}
      </ListItemIcon>
      {!collapsed && (
        <ListItemText
          primary={label}
          slotProps={{ primary: { variant: "body2" } }}
        />
      )}
    </ListItemButton>
  );

  return collapsed ? (
    <Tooltip title={label} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}
