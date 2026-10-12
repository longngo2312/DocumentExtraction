import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";

const OPTIONS = [
  { value: "light", label: "Light", icon: <LightModeOutlinedIcon fontSize="small" /> },
  { value: "system", label: "System", icon: <SettingsBrightnessOutlinedIcon fontSize="small" /> },
  { value: "dark", label: "Dark", icon: <DarkModeOutlinedIcon fontSize="small" /> },
] as const;

/**
 * Light / system / dark. MUI persists the choice itself (localStorage
 * `mui-mode`), so this must not write storage of its own — a second writer
 * would fight the no-flash script in index.html.
 */
export default function ThemeModeToggle() {
  const { mode, setMode } = useColorScheme();

  // `mode` is undefined until MUI has read storage. Reserve the space rather
  // than rendering "light" and letting the control visibly jump a frame later.
  if (!mode) return <Box sx={{ height: 34 }} />;

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_event, value) => {
        if (value) setMode(value);
      }}
      aria-label="Colour theme"
      sx={{ width: "100%", "& .MuiToggleButton-root": { flex: 1, py: 0.5 } }}
    >
      {OPTIONS.map((option) => (
        <Tooltip key={option.value} title={option.label}>
          <ToggleButton value={option.value} aria-label={option.label}>
            {option.icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
