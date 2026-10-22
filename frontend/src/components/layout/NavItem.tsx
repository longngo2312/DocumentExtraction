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
        // A full pill when expanded, a rounded square when collapsed — at
        // icon-only width a pill and a circle are indistinguishable, and the
        // square reads as a button. 34px tall clears the 24px minimum target
        // with room to spare while staying as tight as the reference.
        minHeight: 34,
        borderRadius: collapsed ? 1 : 999,
        px: collapsed ? 0.75 : 1.5,
        py: 0.5,
        justifyContent: collapsed ? "center" : "flex-start",
        color: "text.secondary",
        position: "relative",
        "&:hover": { bgcolor: "action.hover" },
        // A filled pill, not a leading bar: the fill, the accent colour and
        // the weight are three signals, so the state never rests on colour
        // alone for anyone who cannot see it.
        "&.active": {
          bgcolor: "surface.activeRow",
          color: "primary.main",
          "& .MuiListItemIcon-root": { color: "primary.main" },
          "& .MuiListItemText-primary": { fontWeight: 600 },
          "&:hover": { bgcolor: "surface.activeRow" },
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 0,
          mr: collapsed ? 0 : 1.25,
          color: "inherit",
          justifyContent: "center",
          "& .MuiSvgIcon-root": { fontSize: 18 },
        }}
      >
        {icon}
      </ListItemIcon>
      {!collapsed && (
        <ListItemText
          primary={label}
          slotProps={{ primary: { variant: "body2", sx: { fontWeight: 500 } } }}
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
