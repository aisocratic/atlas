import config from "../../atlas.config"
import { resolveConfig } from "../config"
import { getDatabase } from "../db/pool"
import { createIngestHandlers } from "./service"
export function getIngestHandlers() { return createIngestHandlers({ config: resolveConfig(config), env: process.env, database: getDatabase }) }
