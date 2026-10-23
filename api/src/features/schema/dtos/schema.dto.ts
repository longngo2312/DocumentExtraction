export interface SchemaColumnInput {
  /** Set for a column that already exists; absent for a new one. */
  id?: number;
  name: string;
  description?: string;
  data_type?: "text" | "number" | "date" | "boolean" | "enum";
  enum_options?: string[];
  required?: boolean;
}

export interface CreateSchemaBody {
  name: string;
  description?: string;
  columns: SchemaColumnInput[];
}

export interface UpdateSchemaBody {
  name?: string;
  description?: string;
  columns?: SchemaColumnInput[];
}
