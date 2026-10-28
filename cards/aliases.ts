/**
 * Old card id → current id, for cards that were renamed. Browser-safe. Saved
 * dashboards, the dataset route, card pages and ?card= links map through it
 * (lib/dashboard/card-ids.ts), so renaming a card's folder and id keeps every
 * saved layout that placed it. Add the old id here whenever a card is renamed.
 */
export const cardIdAliases: Readonly<Record<string, string>> = {}
