import "../env";
import { closeDatabase, getDatabase, migrate } from "../../lib/db/index";
try {
  const db = getDatabase();
  const applied = await migrate(db);
  console.log(`Atlas schema ${db.schema}: ${applied.length ? `applied ${applied.join(", ")}` : "up to date"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exitCode = 1;
} finally { await closeDatabase(); }
