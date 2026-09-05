import { getIngestHandlers } from "../../../../lib/ingest/runtime"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export function POST(request: Request) { return getIngestHandlers().post(request, "vitals") }
export function OPTIONS(request: Request) { return getIngestHandlers().options(request) }
