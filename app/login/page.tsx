import { redirect } from "next/navigation";
import { PageHeader } from "@aisocratic/design/components/page-header";
import { authSettings, authorizeRequest } from "@/lib/auth";
import { pageRequest } from "@/lib/auth/server";
import { LoginForm } from "./login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const settings = authSettings();
  if (settings.issues.length || settings.mode !== "password") redirect("/setup");
  const auth = await authorizeRequest(await pageRequest(), "read");
  if (auth.ok) redirect("/");
  return <main id="main-content" tabIndex={-1} className="page-shell flex-1 py-16 focus:outline-none"><div className="mx-auto max-w-md space-y-8 rounded-xl border border-border bg-card p-8">
    <PageHeader title="Sign in to Atlas" subtitle="Enter your team's shared password to access engineering telemetry." /><LoginForm />
  </div></main>;
}
