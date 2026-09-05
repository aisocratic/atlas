import nextEnv from "@next/env";
// Match the application's .env.local/.env precedence; existing process values win.
nextEnv.loadEnvConfig(process.cwd());
