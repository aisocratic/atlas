/** Explicit opt-in only. A reserved schema namespace prevents mode switches mixing data. */
export function demoMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.ATLAS_DEMO !== undefined && !["true", "false"].includes(env.ATLAS_DEMO)) throw new Error("ATLAS_DEMO must be true or false.")
  return env.ATLAS_DEMO === "true"
}
export function runtimeSchema(env: Readonly<Record<string, string | undefined>>): string {
  const live = env.ATLAS_SCHEMA ?? "atlas"
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(live)) throw new Error("ATLAS_SCHEMA must be a valid lowercase identifier.")
  if (live.startsWith("atlas_demo_")) throw new Error("ATLAS_SCHEMA cannot use the reserved atlas_demo_ prefix.")
  if (!demoMode(env)) return live
  const selected = env.ATLAS_DEMO_SCHEMA ?? "atlas_demo_preview"
  if (!/^atlas_demo_[a-z0-9_]{1,52}$/.test(selected)) throw new Error("ATLAS_DEMO_SCHEMA must start with atlas_demo_.")
  return selected
}
