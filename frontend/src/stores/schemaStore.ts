import { create } from "zustand";
import { ApiError } from "../api/client";
import {
  createDocumentSchema,
  deleteSchema,
  getAllSchemas,
} from "../api/schema";
import type { DocumentSchema } from "../types";

interface SchemaState {
  schemas: DocumentSchema[];
  loading: boolean;
  /** Lets the page tell "request failed" apart from "no schemas yet". */
  error: string | null;
  fetchSchema: () => Promise<void>;
  removeSchema: (id: number) => Promise<void>;
  addSchema: (
    name: string,
    description: string,
    columns: unknown[],
  ) => Promise<void>;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export const useSchemaStore = create<SchemaState>((set) => ({
  schemas: [],
  loading: false,
  error: null,

  fetchSchema: async () => {
    set({ loading: true, error: null });
    try {
      const schemas = await getAllSchemas();
      set({ schemas });
    } catch (error) {
      console.error(error);
      set({ error: messageFor(error, "Failed to load schemas") });
    } finally {
      set({ loading: false });
    }
  },

  removeSchema: async (id) => {
    await deleteSchema(id);
    set((state) => ({
      schemas: state.schemas.filter((schema) => schema.id !== id),
    }));
  },

  addSchema: async (name, description, columns) => {
    set({ loading: true });
    try {
      const created = (await createDocumentSchema(
        name,
        description,
        columns,
      )) as DocumentSchema;
      set((state) => ({ schemas: [created, ...state.schemas] }));
    } finally {
      set({ loading: false });
    }
  },
}));
