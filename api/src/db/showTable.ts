import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const adminDB = new Database(path.join(__dirname, "../../db/admin.sqlite"));

console.log("\n=== USERS ===");
const users = adminDB
  .prepare("SELECT id, username, email, tenant_db_path, created_at, last_login_at FROM users")
  .all();
console.table(users);

for (const user of users as any[]) {
  const tenantPath = path.join(__dirname, `../../db/tenant/user_${user.id}.sqlite`);
  console.log(`\n=== SCHEMAS for user ${user.username} (${tenantPath}) ===`);
  try {
    const tenantDB = new Database(tenantPath);
    const schemas = tenantDB.prepare("SELECT * FROM document_schemas").all();
    console.table(schemas);

    for (const schema of schemas as any[]) {
      console.log(`  --- Columns for schema "${schema.name}" ---`);
      const columns = tenantDB
        .prepare("SELECT * FROM schema_columns WHERE schema_id = ? ORDER BY position")
        .all(schema.id);
      console.table(columns);
    }
    tenantDB.close();
  } catch (err: any) {
    console.log(`  [could not open tenant DB: ${err.message}]`);
  }
}

adminDB.close();
