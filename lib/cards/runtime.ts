import config from "../../atlas.config"
import { serverRegistry } from "../../cards/server"
import { resolveConfig } from "../config"
import { getDatabase } from "../db/pool"
import { CardServices } from "./service"

/** Called on demand, so neither builds nor client imports initialize Postgres. */
export function getCardServices(): CardServices {
  return new CardServices({ registry: serverRegistry, config: resolveConfig(config), env: process.env, database: getDatabase })
}
