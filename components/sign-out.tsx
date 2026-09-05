/* eslint-disable @next/next/no-location-assign-relative-destination -- Clear the client router cache after authentication cookie changes. */
"use client";
import { useState } from "react";
export function SignOut() {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) { window.location.assign("/login"); return; }
      const { csrfToken } = await session.json();
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "X-Atlas-CSRF": csrfToken } });
      if (!response.ok) throw new Error();
      window.location.assign("/login");
    } catch { setError("Sign-out failed. Try again."); setPending(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><button onClick={logout} disabled={pending} className="rounded-md border border-border px-3 py-2 text-small hover:bg-muted disabled:opacity-60">{pending ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-small text-destructive">{error}</p>}</div>;
}
