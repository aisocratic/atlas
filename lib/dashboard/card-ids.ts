// Renamed cards keep answering to their old ids. Saved layouts, favourites
// and full-screen links store card ids, so a rename lists old id → new id in
// an alias table and every reader maps through canonicalCardId instead of
// dropping the card as unknown (or, beside a copy saved under the new id,
// showing it twice). After the website's RENAMED_CARD_IDS in
// lib/admin/dashboard-cards.ts.

export type CardIdAliases = Readonly<Record<string, string>>;

/** The id a card goes by now: through every rename (v1 → v2 → v3), and never round a loop. */
export function canonicalCardId(id: string, aliases: CardIdAliases): string {
  const seen = new Set<string>();
  let current = id;
  while (Object.hasOwn(aliases, current) && !seen.has(current)) {
    seen.add(current);
    current = aliases[current];
  }
  return current;
}

/** Ids mapped to their current ones, the first of any two that now name the same card kept, in order. */
export function canonicalCardIds(ids: readonly string[], aliases: CardIdAliases): string[] {
  return [...new Set(ids.map(id => canonicalCardId(id, aliases)))];
}
