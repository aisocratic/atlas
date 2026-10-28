"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";

/** Cards loaded on the first paint, before any viewport check: about one screenful. */
export const EAGER_CARDS = 6;
/** A card loads once it comes within one viewport height of the screen, as on the website's admin dashboard. */
export const NEAR_VIEWPORT_MARGIN = "100% 0px";

/**
 * The ids of the cards under `container` that are near the screen: the
 * `eager` ones from the start, every other once it comes within a screen of
 * the viewport, and near from then on. Each card is an element matching
 * `[attribute]`, its id that attribute's value. `key` changes whenever the
 * cards do, so new ones are watched. Without IntersectionObserver every card
 * is near at once.
 */
export function useNearViewport(container: RefObject<HTMLElement | null>, attribute: string, eager: readonly string[], key: string): ReadonlySet<string> {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const elements = [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)];
    const add = (ids: string[]) => setSeen(previous => ids.every(id => previous.has(id)) ? previous : new Set([...previous, ...ids]));
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => add(elements.map(element => element.getAttribute(attribute) ?? "")));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      const ids = entries.filter(entry => entry.isIntersecting).map(entry => entry.target.getAttribute(attribute) ?? "");
      if (ids.length) add(ids);
      for (const entry of entries) if (entry.isIntersecting) observer.unobserve(entry.target);
    }, { rootMargin: NEAR_VIEWPORT_MARGIN });
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [container, attribute, key]);
  const eagerKey = eager.join("\n");
  return useMemo(() => new Set([...seen, ...eagerKey.split("\n").filter(Boolean)]), [seen, eagerKey]);
}
