import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { useState } from "react";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  autoComplete?: string;
  disabled?: boolean;
}

export default function PasswordField({
  value,
  onChange,
  label = "Password",
  helperText,
  autoComplete = "current-password",
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText}
      autoComplete={autoComplete}
      disabled={disabled}
      fullWidth
      required
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setVisible((previous) => !previous)}
                edge="end"
                size="small"
                // Without this the button is announced as unlabelled.
                aria-label={visible ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {visible ? (
                  <VisibilityOffOutlinedIcon fontSize="small" />
                ) : (
                  <VisibilityOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
