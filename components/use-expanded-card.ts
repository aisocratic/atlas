"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { cardHref, readCardParam } from "@/lib/dashboard/card-url";

// history.pushState/replaceState don't emit `popstate`, so our own writes
// announce themselves on this event for the subscription below.
const CARD_URL_EVENT = "atlas-card-change";

function writeCardParam(id: string | null, mode: "push" | "replace"): void {
  const url = cardHref(window.location, id);
  // history, not the router: the dashboard must not re-render or refetch every
  // card because one of them went full screen.
  if (mode === "push") window.history.pushState(window.history.state, "", url);
  else window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CARD_URL_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CARD_URL_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CARD_URL_EVENT, onChange);
  };
}

/**
 * Full screen: at most one card at a time, held in the URL (?card=<id>) so the
 * browser's Back button closes it and the full-screen card is a shareable link.
 * `resolve` turns the URL's id into a card on the current view, or null; a
 * card the URL names but the view does not show (a stale or cross-view link)
 * simply doesn't expand. Esc closes it, and the page behind does not scroll.
 */
export function useExpandedCard({ resolve, canonical }: { resolve: (id: string) => string | null; canonical?: (id: string) => string }) {
  const urlCard = useSyncExternalStore(subscribe, () => readCardParam(window.location.search, canonical), () => null);
  const expandedId = urlCard ? resolve(urlCard) : null;

  // Whether the history entry the card sits on is one we pushed. If it is,
  // closing pops it instead of stacking a second entry (so Back doesn't walk
  // back through every open and close). Any popstate invalidates the claim.
  const pushed = useRef(false);
  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const closeCard = useCallback(() => {
    if (!readCardParam(window.location.search)) return;
    if (pushed.current) {
      pushed.current = false;
      // Pops our entry; the popstate that follows re-reads the URL and closes.
      window.history.back();
    } else {
      // Arrived by a shared link or forward navigation: nothing of ours to pop,
      // so drop the parameter in place rather than leaving the dashboard.
      writeCardParam(null, "replace");
    }
  }, []);

  // What had focus when a card opened gets it back when the card closes.
  const opener = useRef<HTMLElement | null>(null);
  const setExpanded = useCallback((id: string, next: boolean) => {
    if (!next) {
      closeCard();
      return;
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Going straight from one full-screen card to another replaces the entry we
    // already own instead of stacking a second one.
    if (readCardParam(window.location.search)) {
      writeCardParam(id, "replace");
      return;
    }
    writeCardParam(id, "push");
    pushed.current = true;
  }, [closeCard]);

  // A card that disappears from under full screen (unstarred, filtered out by a
  // view switch) closes it and takes its stale ?card= with it, but only once it
  // was actually open, so a shared link is never stripped before its view loads.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (expandedId) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (urlCard) writeCardParam(null, "replace");
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  }, [expandedId, urlCard]);

  // Esc closes it (unless it is closing a dropdown inside the card), and the page behind must not scroll while covered.
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest("[role=listbox],[role=menu],dialog[open]"))) return;
      closeCard();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [expandedId, closeCard]);

  return { expandedId, setExpanded, closeCard };
}
