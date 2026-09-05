import { dashboardHandlers } from "@/lib/dashboard/handlers";
export const runtime = "nodejs";
const handle = dashboardHandlers();
export const GET = (request: Request) => handle(request, "list");
export const POST = (request: Request) => handle(request, "create");
