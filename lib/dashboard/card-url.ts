// The full-screen card lives in the URL (`?card=<id>`) rather than in component
// state: expanding pushes a history entry, so Back closes it, and a full-screen
// card is a link that can be shared or bookmarked. After the website's admin
// dashboard (app/(admin)/admin/dashboard-client.tsx). These helpers are pure;
// components/use-expanded-card.ts binds them to the browser's history.

export const CARD_PARAM = "card";

/** The card a query string names, through `canonical` so a link to a renamed card still opens it. */
export function readCardParam(search: string, canonical: (id: string) => string = id => id): string | null {
  const id = new URLSearchParams(search).get(CARD_PARAM)?.trim();
  return id ? canonical(id) : null;
}

/** The same location with `?card=` set to `id`, or dropped for null; every other parameter and the hash kept. */
export function cardHref({ pathname, search, hash = "" }: { pathname: string; search: string; hash?: string }, id: string | null): string {
  const params = new URLSearchParams(search);
  if (id) params.set(CARD_PARAM, id);
  else params.delete(CARD_PARAM);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
