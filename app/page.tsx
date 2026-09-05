import Link from "next/link";
import { PageHeader } from "@aisocratic/design/components/page-header";
import { requirePageAuth } from "@/lib/auth/server";
import { SignOut } from "@/components/sign-out";
import { DashboardCanvas } from "@/components/dashboard/dashboard-canvas";
import { DashboardService, type DashboardView } from "@/lib/dashboard/service";
import { getDatabase } from "@/lib/db/pool";
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dashboard?: string }> }) {
  const principal = await requirePageAuth();
  let initial: DashboardView[] = []; let error = false;
  try { initial = await new DashboardService(getDatabase()).list(principal.id); } catch { error = true; }
  const { dashboard } = await searchParams;
  return <main id="main-content" tabIndex={-1} className="page-shell flex-1 space-y-8 py-10 focus:outline-none">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title="Engineering telemetry" subtitle="Your site and repository, in one place. Arrange cards into dashboards saved for your team." />{principal.kind === "session" && <SignOut />}</div>
    {error ? <section role="alert" className="space-y-4 rounded-xl border border-border bg-card p-6"><h2 className="text-lead font-medium">Dashboards are unavailable</h2><p>Check your database connection and run the setup migrations, then reload this page.</p><Link href="/setup" className="underline">Open setup</Link></section> : <DashboardCanvas initial={initial} selectedId={dashboard} />}
  </main>;
}
