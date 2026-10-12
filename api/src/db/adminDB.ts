/// <reference types="node" />
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_path = path.join(__dirname, "../../db/admin.sqlite");

const adminDB = new Database(DB_path);
adminDB.pragma("journal_mode = WAL");
adminDB.pragma("foreign_keys = ON");

adminDB.exec(
  `
        CREATE table IF NOT EXISTS users (
            id              INTEGER    PRIMARY KEY     AUTOINCREMENT,
            username        TEXT        NOT NULL        UNIQUE,
            email           TEXT        NOT NULL        UNIQUE,
            password_hash  TEXT        NOT NULL,
            tenant_db_path  TEXT        NOT NULL        DEFAULT '',
            created_at      TEXT        NOT NULL        DEFAULT (datetime('now')),
            last_login_at   TEXT 
        );

        CREATE table IF NOT EXISTS extraction_jobs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            document_id  INTEGER NOT NULL,      
            status       TEXT NOT NULL DEFAULT 'queued'
                        CHECK(status IN ('queued','running','done','failed')),
            attempts     INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            error        TEXT,
            started_at   TEXT,
            finished_at  TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON extraction_jobs(status, id);

        -- One row per issued refresh token. token_hash is a SHA-256 of the
        -- value we handed the client: a leaked DB gives an attacker hashes,
        -- not usable sessions. Rows are kept after revocation so that reuse
        -- of a rotated token is detectable (see revokeAllForUser).
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash  TEXT    NOT NULL UNIQUE,
            expires_at  TEXT    NOT NULL,
            revoked_at  TEXT,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    `,
);

export default adminDB;
