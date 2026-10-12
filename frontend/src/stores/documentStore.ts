import { create } from "zustand";
import { deleteDocument, getDocuments, uploadDocument } from "../api/documents";
import type { DocumentListItem } from "../types";

interface DocumentState {
  documents: DocumentListItem[];
  loading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  addDocument: (file: File, schemaId: number) => Promise<void>;
  removeDocument: (id: number) => Promise<void>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  loading: false,
  error: null,
  fetchDocuments: async () => {
    set({ loading: true, error: null });
    try {
      const documents = await getDocuments();
      set({ documents });
    } catch (error) {
      console.error(error);
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  addDocument: async (file, schemaId) => {
    await uploadDocument(file, schemaId);
    // The upload response has no schema_name — it comes from the unjoined
    // read-back — so refetch instead of prepending a half-shaped row.
    await get().fetchDocuments();
  },

  removeDocument: async (id) => {
    await deleteDocument(id); //Delete docs in database
    set((state) => ({
      documents: state.documents.filter((document) => document.id !== id),
    }));
  },
}));
