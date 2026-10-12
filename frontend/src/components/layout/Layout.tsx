import MenuIcon from "@mui/icons-material/Menu";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  Toolbar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar, {
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_COLLAPSED,
} from "./AppSidebar";
import Brand from "./Brand";
import ProfileMenu from "./ProfileMenu";

const COLLAPSED_KEY = "sidebarCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function Layout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Closing on navigation is driven by the nav handlers below, not an effect on
  // pathname — otherwise the drawer sits on top of the page the user just
  // opened. Every in-drawer control that navigates must call closeMobile.
  const closeMobile = () => setMobileOpen(false);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        /* storage blocked — the preference just won't persist */
      }
      return next;
    });
  }

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: "flex", minHeight: "100%" }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: "absolute",
          left: -9999,
          top: 0,
          zIndex: (t) => t.zIndex.tooltip + 1,
          "&:focus": {
            left: 8,
            top: 8,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "background.paper",
            boxShadow: 3,
          },
        }}
      >
        Skip to content
      </Box>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width,
              boxSizing: "border-box",
              borderRight: 0,
              transition: theme.transitions.create("width", {
                duration: theme.transitions.duration.shorter,
              }),
              overflowX: "hidden",
            },
          }}
        >
          <AppSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={closeMobile}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: SIDEBAR_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          <AppSidebar
            collapsed={false}
            onToggleCollapse={toggleCollapsed}
            onNavigate={closeMobile}
            showCollapseToggle={false}
          />
        </Drawer>
      )}

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: "100%",
        }}
      >
        {!isDesktop && (
          <AppBar
            position="sticky"
            elevation={0}
            sx={{
              bgcolor: "background.paper",
              color: "text.primary",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Toolbar sx={{ gap: 1 }}>
              <IconButton
                edge="start"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
              >
                <MenuIcon />
              </IconButton>
              <Brand size={28} />
              <Box sx={{ flexGrow: 1 }} />
              <ProfileMenu collapsed />
            </Toolbar>
          </AppBar>
        )}

        {/* No Container here — PageShell owns page width. Nesting both is what
            made every page doubly padded and doubly constrained. */}
        <Box
          component="main"
          id="main"
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
