/// <reference types="node" />
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANTS_DIR = path.join(__dirname, "../../db/tenant");

export function openTenantDB(tenantDBPath: string) {
  const db = new Database(tenantDBPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(
    // Create tables for each users
    `   
        DROP TABLE IF EXISTS extractedDocumentText;
 
        CREATE TABLE IF NOT EXISTS document_schemas (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL UNIQUE,
            description  TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS schema_columns (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_id    INTEGER NOT NULL REFERENCES document_schemas(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            description  TEXT,
            data_type    TEXT NOT NULL DEFAULT 'text'
                         CHECK(data_type IN ('text','number','date','boolean','enum')),
            enum_options TEXT,
            required     INTEGER NOT NULL DEFAULT 0,
            position     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS documents (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_id    INTEGER NOT NULL REFERENCES document_schemas(id) ON DELETE CASCADE,
            filename     TEXT NOT NULL,          -- original display name
            mime_type    TEXT NOT NULL,
            storage_path TEXT NOT NULL,          -- server-generated, never client input
            size_bytes   INTEGER NOT NULL,
            status       TEXT NOT NULL DEFAULT 'uploaded',
            uploaded_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_documents_schema ON documents(schema_id);

        CREATE TABLE IF NOT EXISTS parsedDocumentText (
            document_id  INTEGER NOT NULL PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
            text         TEXT NOT NULL,
            pages_json   TEXT NOT NULL,   -- [{ page, text, source, label? }] — the review payload
            spans_json   TEXT NOT NULL DEFAULT '[]',  -- [{ page, width, height, spans }] — extraction only
            page_count   INTEGER NOT NULL,
            char_count   INTEGER NOT NULL, 
            method       TEXT NOT NULL,
            parsed_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );


        CREATE TABLE IF NOT EXISTS extracted_values (
            id INTEGER   PRIMARY KEY AUTOINCREMENT,
            document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            column_id    INTEGER NOT NULL REFERENCES schema_columns(id) ON DELETE CASCADE, 
            llm_confidence REAL,    -- model's own 0..1, conditioned on its own quote
            llm_reasoning  TEXT,    -- one sentence: the inference, in words
            basis        TEXT CHECK (basis IN ('stated','inferred','absent')),
            support      TEXT CHECK (support IN ('entailed','partial','unsupported','contradicted')),
            llm_value    TEXT,
            llm_quote    TEXT, 
            value_text   TEXT, 
            value_number REAL,
            value_date   TEXT,
            source_page  INTEGER,
            source_start INTEGER, 
            source_end   INTEGER, 
            source_span_ids TEXT,   -- JSON number[], null when nothing was located
            source_boxes    TEXT,   -- JSON NormalizedBox[], null for formats with no geometry
            match_kind   TEXT CHECK(match_kind IN ('exact', 'normalized', 'none')),
            confidence   REAL,
            review_status TEXT NOT NULL DEFAULT 'unreviewed'
                          CHECK(review_status IN ('unreviewed', 'accepted', 'edited', 'rejected')),
            reviewed_at  TEXT, 
            UNIQUE(document_id, column_id)   
        );

        CREATE INDEX IF NOT EXISTS idx_values_document ON extracted_values(document_id);

        CREATE TABLE IF NOT EXISTS document_summaries (
            document_id  INTEGER NOT NULL PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
            overview     TEXT NOT NULL,
            key_findings TEXT NOT NULL DEFAULT '[]',
            caveats      TEXT NOT NULL DEFAULT '[]',
            model        TEXT NOT NULL,
            input_chars  INTEGER NOT NULL,
            generated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
    `, //pages_json` is `JSON.stringify(result.pages)
  );
  return db;
}

export function tenantDBPath(userId: number): string {
  return path.join(TENANTS_DIR, `user_${userId}.sqlite`);
}

export function provisionTenantDB(userId: number): string {
  if (!fs.existsSync(TENANTS_DIR)) {
    fs.mkdirSync(TENANTS_DIR, { recursive: true });
  }
  const dbPath = tenantDBPath(userId);
  openTenantDB(dbPath);
  return dbPath;
}

export function getTenantDb(userId: number) {
  return openTenantDB(tenantDBPath(userId));
}
