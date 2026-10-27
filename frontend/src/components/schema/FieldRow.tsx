import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  FormControl,
  FormHelperText,
  IconButton,
  InputBase,
  NativeSelect,
  OutlinedInput,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ColumnDataType } from "../../types";
import { DATA_TYPES, type ColumnDraft, type DraftRow, type RowErrors } from "./schemaDraft";

/** # · field · type · required · remove — shared by the header and every row. */
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: "28px minmax(160px, 1fr) 130px 72px 40px",
  gap: 1.5,
  // Below this the card scrolls sideways rather than crushing the name column.
  minWidth: 500,
  boxSizing: "border-box",
  px: 3,
} as const;

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** A borderless line input: dashed at rest, ringed when focused. */
const UNDERLINE_SX = {
  fontSize: 14,
  borderBottom: "1px dashed",
  borderColor: "surface.control",
  "& input": { py: 0.75, px: 0.25 },
  "&.Mui-focused": {
    borderBottomStyle: "solid",
    borderColor: "primary.main",
    outline: "2px solid",
    outlineColor: "primary.main",
    outlineOffset: 2,
    borderRadius: 0.5,
  },
  "&.Mui-error": { borderColor: "error.main" },
} as const;

/** Column titles for the field rows. Hidden from assistive tech: every input
 *  carries its own label, so these would only be read twice. */
export function FieldListHeader() {
  return (
    <Box
      aria-hidden
      sx={{
        ...ROW_GRID,
        py: 1.25,
        bgcolor: "surface.sunken",
        borderBottom: 1,
        borderColor: "divider",
        color: "text.secondary",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      <span>#</span>
      <span>Field</span>
      <span>Type</span>
      <span>Required</span>
      <span />
    </Box>
  );
}

interface FieldRowProps {
  row: DraftRow;
  /** 1-based — every accessible name counts from 1. */
  position: number;
  /** Only the errors that should show now: touched fields, or after a save. */
  errors?: RowErrors;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onBlur: (field: keyof RowErrors) => void;
  onRemove: () => void;
  /** Registers the name input so the page can move focus to it. */
  nameRef: (el: HTMLInputElement | null) => void;
}

export default function FieldRow({
  row,
  position,
  errors,
  onChange,
  onBlur,
  onRemove,
  nameRef,
}: FieldRowProps) {
  const base = `field-${row.uid}`;
  const name = row.name.trim();
  const label = `Field ${position}`;

  return (
    <Box component="li" sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Box
        role="group"
        aria-label={name ? `${label}: ${name}` : label}
        sx={{ ...ROW_GRID, py: 2, alignItems: "start" }}
      >
        <Typography
          aria-hidden
          sx={{ fontFamily: MONO, fontSize: 13, color: "text.secondary", pt: "11px" }}
        >
          {String(position).padStart(2, "0")}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, minWidth: 0 }}>
          <FormControl error={Boolean(errors?.name)} fullWidth>
            <OutlinedInput
              id={`${base}-name`}
              size="small"
              value={row.name}
              placeholder="field_name"
              // Field names become keys in the extraction output; spaces in
              // them only cause trouble downstream.
              onChange={(e) => onChange({ name: e.target.value.replace(/\s+/g, "_") })}
              onBlur={() => onBlur("name")}
              inputRef={nameRef}
              inputProps={{
                "aria-label": `${label} name`,
                "aria-describedby": errors?.name ? `${base}-name-error` : undefined,
                spellCheck: false,
              }}
              sx={{ fontFamily: MONO, fontSize: 15, height: 40 }}
            />
            {errors?.name && (
              <FormHelperText id={`${base}-name-error`} sx={{ mx: 0 }}>
                {errors.name}
              </FormHelperText>
            )}
          </FormControl>

          <InputBase
            value={row.description}
            placeholder="Hint for the extractor, e.g. “Full legal name at top of page”"
            onChange={(e) => onChange({ description: e.target.value })}
            inputProps={{ "aria-label": `${label} hint` }}
            sx={UNDERLINE_SX}
          />

          {row.data_type === "enum" && (
            <FormControl error={Boolean(errors?.options)} fullWidth>
              <InputBase
                id={`${base}-options`}
                value={row.enum_options}
                placeholder="Options, comma-separated, e.g. Bachelor's, Master's"
                onChange={(e) => onChange({ enum_options: e.target.value })}
                onBlur={() => onBlur("options")}
                inputProps={{
                  "aria-label": `${label} options`,
                  "aria-describedby": errors?.options ? `${base}-options-error` : undefined,
                }}
                sx={UNDERLINE_SX}
              />
              {errors?.options && (
                <FormHelperText id={`${base}-options-error`} sx={{ mx: 0 }}>
                  {errors.options}
                </FormHelperText>
              )}
            </FormControl>
          )}
        </Box>

        <NativeSelect
          value={row.data_type}
          onChange={(e) => onChange({ data_type: e.target.value as ColumnDataType })}
          input={<OutlinedInput size="small" sx={{ height: 40 }} />}
          inputProps={{ "aria-label": `${label} type`, id: `${base}-type` }}
        >
          {DATA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </NativeSelect>

        <Box sx={{ height: 40, display: "flex", alignItems: "center" }}>
          <Switch
            checked={row.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            slotProps={{ input: { "aria-label": `${label} required` } }}
            sx={{
              ml: -1.5,
              // The default off-track is 2.7:1 on white — under the 3:1 a
              // control's edge needs.
              "& .MuiSwitch-track": { bgcolor: "surface.control", opacity: 1 },
              "& .Mui-checked + .MuiSwitch-track": { bgcolor: "primary.main", opacity: 0.5 },
            }}
          />
        </Box>

        <Tooltip title="Remove field">
          <IconButton
            aria-label={`Remove field ${position}${name ? ` (${name})` : ""}`}
            onClick={onRemove}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "error.main", bgcolor: "action.hover" },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
