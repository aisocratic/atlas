import Link from "next/link";
import { PageHeader } from "@aisocratic/design/components/page-header";
import config from "@/atlas.config";
import { setupStatus } from "@/lib/auth/setup";
export const dynamic = "force-dynamic";
export default function SetupPage() {
  const status = setupStatus(config);
  const checks = [
    { label: "Authentication", ready: status.authentication, detail: "Choose a shared password or an authenticated proxy. Production never allows open access." },
    { label: "Database", ready: status.database, detail: "Set DATABASE_URL to your PostgreSQL database, then run the setup command below." },
    { label: "Site", ready: status.site && status.configuration, detail: "Set ATLAS_SITE_URL to the site you want to monitor, or configure siteUrl in atlas.config.ts." },
  ];
  return <main id="main-content" tabIndex={-1} className="page-shell flex-1 space-y-8 py-10 focus:outline-none">
    <PageHeader title="Set up Atlas" subtitle="Connect your database and choose how people sign in. Configuration stays on your server." />
    <div className="grid gap-4 md:grid-cols-3">{checks.map(check => <section key={check.label} className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-heading-3">{check.label}</h2><p className="mt-2 font-code text-micro text-muted-foreground">{check.ready ? "Configured" : "Needs configuration"}</p><p className="mt-4 text-body text-muted-foreground">{check.detail}</p>
    </section>)}</div>
    {status.issues.length > 0 && <div className="rounded-xl border border-border bg-muted p-6"><h2 className="font-medium">Authentication configuration</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-body">{status.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
    <section className="max-w-3xl space-y-4"><h2 className="font-display text-heading-2">Configure the server</h2>
      <p className="text-muted-foreground">Copy .env.example to .env.local and set your database, site, dashboard origin, and authentication values. Generate separate random secrets for each credential. Restart Atlas after changing environment variables.</p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-code text-small"><code>{"cp .env.example .env.local\n# Fill in your configuration, then:\npnpm run setup\npnpm dev"}</code></pre>
      <p className="text-small text-muted-foreground">The setup command applies database migrations. These checks confirm configuration; they do not test database connectivity. This page never writes your environment or displays credentials.</p>
      <p><a className="underline underline-offset-4" href="https://github.com/aisocratic/atlas/blob/main/docs/AUTH.md">Authentication and deployment instructions</a></p>
      {status.ready && <Link className="inline-flex rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground" href={status.mode === "password" ? "/login" : "/"}>{status.mode === "password" ? "Sign in" : "Open dashboard"}</Link>}
      {status.mode === "header" && status.authentication && <p className="text-muted-foreground">Open the dashboard through your authenticated proxy. Both the verified identity and proxy secret headers are required.</p>}
    </section>
  </main>;
}
