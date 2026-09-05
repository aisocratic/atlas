import { defineConfig } from "./lib/config"

export default defineConfig({
  // Set siteUrl here or use ATLAS_SITE_URL. Repository collectors use owner/name.
  // Secrets belong in environment variables, never in this file or card metadata.
  cards: { "region-latency": true },
})
