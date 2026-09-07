import { LogoMark } from "@aisocratic/design/brand"
import { SiteFooter } from "@aisocratic/design/components/site-footer"

export function ProjectFooter({ homeHref = "/" }: { homeHref?: string }) {
  const repository = "https://github.com/aisocratic/atlas"
  return <SiteFooter className="atlas-project-footer"
    brand={<a href={homeHref} aria-label="Atlas home" className="inline-flex items-center gap-2 font-body text-lead font-medium"><LogoMark size={24} aria-hidden="true" />Atlas</a>}
    description="Analytics for your engineering, audience, and AI activity."
    columns={[
      { title: "Explore", links: [{ href: `${homeHref}#overview`, label: "Overview" }, { href: `${homeHref}#features`, label: "Features" }, { href: `${homeHref}demo/`, label: "Demo" }] },
      { title: "Project", links: [{ href: `${repository}#readme`, label: "Documentation" }, { href: repository, label: "GitHub" }, { href: `${repository}/issues`, label: "Issues" }] },
      { title: "Family", links: [{ href: "https://aisocratic.org", label: "AI Socratic" }, { href: "https://aisocratic.github.io/stoa/", label: "Stoa · Design" }, { href: "https://aisocratic.github.io/agora/", label: "Agora · Kanban" }, { href: "https://aisocratic.github.io/atlas/", label: "Atlas · Analytics" }] },
    ]}
    copyright="MIT © AI Socratic"
    bottomLinks={[{ href: "https://aisocratic.org/brand", label: "Brand" }, { href: `${repository}/blob/main/LICENSE`, label: "Licence" }, { href: repository, label: "GitHub ↗" }]}
  />
}
