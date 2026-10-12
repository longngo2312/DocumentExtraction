import LogoutIcon from "@mui/icons-material/Logout";
import {
  Avatar,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/layout/PageShell";
import ThemeModeToggle from "../components/layout/ThemeModeToggle";
import { useAuthStore } from "../stores/authStore";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <PageShell title="Account" subtitle="Your profile and appearance settings." maxWidth="sm">
      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 3 }}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                fontSize: 22,
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              {user?.username?.[0]?.toUpperCase() ?? "?"}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {user?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {user?.email}
              </Typography>
            </Box>
          </Stack>

          <Divider sx={{ mb: 2.5 }} />

          <Stack spacing={2}>
            <Field label="Username" value={user?.username ?? "—"} />
            <Field label="Email" value={user?.email ?? "—"} />
            <Field label="Account ID" value={user ? String(user.id) : "—"} />
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
            Appearance
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            System follows your device setting.
          </Typography>
          <Box sx={{ maxWidth: 260 }}>
            <ThemeModeToggle />
          </Box>
        </Paper>

        <Box>
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Sign out
          </Button>
        </Box>
      </Stack>
    </PageShell>
  );
}
