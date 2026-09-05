import { dashboardHandlers } from "@/lib/dashboard/handlers";
export const runtime = "nodejs";
const handle = dashboardHandlers();
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => handle(request, "get", (await context.params).id);
export const PATCH = async (request: Request, context: Context) => handle(request, "rename", (await context.params).id);
export const DELETE = async (request: Request, context: Context) => handle(request, "delete", (await context.params).id);
