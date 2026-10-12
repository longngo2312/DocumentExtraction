export interface DocumentSchema {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchemaColumns {
  id: number;
  schema_id: number;
  name: string;
  description: string;
  data_type: "text" | "number" | "date" | "boolean" | "enum";
  enum_options: string | null;
  required: number;
  position: number;
}
