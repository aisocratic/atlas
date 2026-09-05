import "../env"
import { demoMode } from "../../lib/demo/mode"
import { createDatabase, databaseOptionsFromEnv } from "../../lib/db/pool"
import { migrate } from "../../lib/db/migrate"
import { seedDemo } from "../../lib/demo/dataset"
if (!demoMode()) throw new Error("Seed only runs with ATLAS_DEMO=true; live measurement tables are never seeded.")
const db = createDatabase(databaseOptionsFromEnv())
try { await migrate(db); console.log(`Seeded ${await seedDemo(db)} synthetic card fixtures in ${db.schema}.`) } finally { await db.close() }
