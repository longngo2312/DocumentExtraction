import { Button, InputAdornment } from "@mui/material";
import { useState, type ReactNode } from "react";
import LabeledField from "./LabeledField";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelAction?: ReactNode;
  placeholder?: string;
  helperText?: string;
  autoComplete?: string;
  disabled?: boolean;
  error?: boolean;
}

export default function PasswordField({
  value,
  onChange,
  label = "Password",
  labelAction,
  placeholder = "••••••••",
  helperText,
  autoComplete = "current-password",
  disabled,
  error,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <LabeledField
      label={label}
      labelAction={labelAction}
      placeholder={placeholder}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText}
      autoComplete={autoComplete}
      disabled={disabled}
      error={error}
      required
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Button
                onClick={() => setVisible((previous) => !previous)}
                size="small"
                color="inherit"
                aria-label={visible ? "Hide password" : "Show password"}
                tabIndex={-1}
                sx={{ minWidth: 0, px: 1.25, fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "none" }}
              >
                {visible ? "Hide" : "Show"}
              </Button>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
