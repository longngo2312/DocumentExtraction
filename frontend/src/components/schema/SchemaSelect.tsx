import {
  FormControl,
  InputLabel,
  MenuItem,
  Link as MuiLink,
  Select,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useSchemaStore } from "../../stores/schemaStore";
interface SchemaSelectProps {
  value: number | "";
  onChange: (schema_id: number) => void;
  disable?: boolean;
}
export default function SchemaSelect({
  value,
  onChange,
  disable,
}: SchemaSelectProps) {
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const schemas = useSchemaStore((s) => s.schemas);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  if (schemas.length === 0) {
    return (
      <Typography color="text.secondary">
        No schemas yet —{" "}
        <MuiLink component={RouterLink} to="/schemas">
          create one first
        </MuiLink>
        .
      </Typography>
    );
  }

  return (
    <FormControl fullWidth disabled={disable}>
      <InputLabel id="schema-select-label">Schema</InputLabel>
      <Select
        labelId="schema-select-label"
        label="Schema"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {schemas.map((schema) => {
          return (
            <MenuItem key={schema.id} value={schema.id}>
              {schema.name}
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}
