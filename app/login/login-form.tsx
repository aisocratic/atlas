/* eslint-disable @next/next/no-location-assign-relative-destination -- Clear the client router cache after authentication cookie changes. */
"use client";
import { useState, type FormEvent } from "react";
export function LoginForm() {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Sign-in failed."); setPending(false); return; }
      window.location.assign("/");
    } catch { setError("Could not reach Atlas. Try again."); setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    <div className="space-y-2"><label htmlFor="password" className="block font-medium">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus maxLength={4096} className="w-full rounded-md border border-input bg-background px-3 py-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring" /></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button type="submit" disabled={pending} className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
