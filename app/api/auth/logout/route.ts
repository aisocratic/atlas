import { authSettings, authorizeRequest, sessionCookie } from "@/lib/auth"
import { authJson } from "@/lib/auth/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  const auth = await authorizeRequest(request, "write")
  if (!auth.ok) return authJson({ error: auth.error }, auth.status)
  return authJson({ ok: true }, 200, { "Set-Cookie": sessionCookie("", authSettings(), true) })
}
