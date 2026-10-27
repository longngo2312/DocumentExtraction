/**
 * Editing a schema must not erase extracted values. Run:
 *   npx tsx src/features/schema/schema.check.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openTenantDB } from "../../db/tenantDb.js";
import { syncColumns } from "./services/schema.service..js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-check-"));
const db = openTenantDB(path.join(dir, "t.sqlite"));

try {
  db.exec(`
    INSERT INTO document_schemas (id, name) VALUES (1, 'Contracts'), (2, 'Other');
    INSERT INTO schema_columns (id, schema_id, name, data_type, position) VALUES
      (1, 1, 'party', 'text', 0), (2, 1, 'notice_days', 'number', 1),
      (3, 1, 'signed', 'date', 2), (9, 2, 'foreign', 'text', 0);
    INSERT INTO documents (id, schema_id, filename, mime_type, storage_path, size_bytes)
      VALUES (1, 1, 'a.pdf', 'application/pdf', 'x', 1);
    INSERT INTO extracted_values (document_id, column_id, value_text, review_status) VALUES
      (1, 1, 'Northwind', 'accepted'), (1, 2, '90', 'edited'), (1, 3, '2026-01-01', 'unreviewed');
  `);

  // Rename `party`, keep `notice_days` (moved first), drop `signed`, add one,
  // and pass another schema's column id, which must not be stolen.
  syncColumns(db, 1, [
    { id: 2, name: "notice_days", data_type: "number" },
    { id: 1, name: "counterparty", data_type: "text", required: true },
    { name: "governing_law", data_type: "text" },
    { id: 9, name: "smuggled", data_type: "text" },
  ]);

  const cols = db
    .prepare(`SELECT id, name, position, required FROM schema_columns WHERE schema_id = 1 ORDER BY position`)
    .all() as { id: number; name: string; position: number; required: number }[];
  assert.deepEqual(
    cols.map((c) => [c.name, c.position]),
    [["notice_days", 0], ["counterparty", 1], ["governing_law", 2], ["smuggled", 3]],
  );
  assert.equal(cols[0].id, 2, "a kept column keeps its id");
  assert.equal(cols[1].id, 1, "a renamed column keeps its id");
  assert.equal(cols[1].required, 1);
  assert.notEqual(cols[3].id, 9, "another schema's id is inserted as new, not moved");
  assert.equal(
    (db.prepare(`SELECT schema_id FROM schema_columns WHERE id = 9`).get() as { schema_id: number }).schema_id,
    2,
  );

  const values = db
    .prepare(`SELECT column_id, value_text, review_status FROM extracted_values ORDER BY column_id`)
    .all() as { column_id: number; value_text: string; review_status: string }[];
  assert.deepEqual(
    values.map((v) => [v.column_id, v.value_text, v.review_status]),
    [[1, "Northwind", "accepted"], [2, "90", "edited"]],
    "reviewed values survive; only the removed column's value is gone",
  );

  console.log("ok  schema edit keeps surviving columns and their values");
} finally {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
