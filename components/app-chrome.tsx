import Link from "next/link"
import { LogoMark } from "@aisocratic/design/brand"
import { SiteHeader } from "@aisocratic/design/components/site-header"
import { Button } from "@aisocratic/design/components/button"
import { ThemePreference } from "@/components/theme-preference"

export function AppHeader() {
  return (
    <>
      <a href="#main-content" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to dashboard
      </a>
      <SiteHeader
        className="static border-b border-border pt-0"
        brand={<Link href="/" aria-label="Atlas home" className="inline-flex items-center gap-2 font-body text-lead font-medium"><LogoMark size={24} aria-hidden="true" />Atlas</Link>}
        actions={<ThemePreference />}
      />
    </>
  )
}

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="page-shell flex flex-wrap items-center justify-between gap-3 py-5">
        <p className="font-code text-micro text-muted-foreground">Atlas · AI Socratic</p>
        <nav aria-label="Project links" className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild><a href="https://github.com/aisocratic/atlas#readme">Documentation</a></Button>
          <Button variant="ghost" size="sm" asChild><a href="https://github.com/aisocratic/atlas">Source</a></Button>
        </nav>
      </div>
    </footer>
  )
}
