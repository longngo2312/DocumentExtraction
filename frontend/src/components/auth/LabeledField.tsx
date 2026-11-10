import { Stack, TextField, Typography, type TextFieldProps } from "@mui/material";
import { useId, type ReactNode } from "react";

type LabeledFieldProps = Omit<TextFieldProps, "label"> & {
  label: string;
  /** Shown on the right of the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
};

/** Auth-form input with its label above it (not floating inside), per the 1b design. */
export default function LabeledField({ label, labelAction, sx, ...props }: LabeledFieldProps) {
  const id = useId();
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography component="label" htmlFor={id} sx={{ fontSize: 13, fontWeight: 600 }}>
          {label}
        </Typography>
        {labelAction}
      </Stack>
      <TextField
        id={id}
        fullWidth
        {...props}
        sx={[
          {
            "& .MuiOutlinedInput-root": { height: 44, fontSize: 14 },
            // Controls need the 3:1 `surface.control` edge, not the faint divider.
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "surface.control" },
            "& .Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
            "& .Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: "error.main" },
            "& .MuiFormHelperText-root": { mx: 0 },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    </Stack>
  );
}
