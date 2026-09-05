import { authSettings, authorizeRequest, csrfToken } from "@/lib/auth"
import { authJson } from "@/lib/auth/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const auth = await authorizeRequest(request, "read")
  if (!auth.ok) return authJson({ error: auth.error }, auth.status)
  return authJson({ principal: auth.principal, csrfToken: csrfToken(request, auth.principal, authSettings()) })
}
