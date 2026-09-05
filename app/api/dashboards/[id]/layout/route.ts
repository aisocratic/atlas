import { dashboardHandlers } from "@/lib/dashboard/handlers";
export const runtime = "nodejs";
const handle = dashboardHandlers();
export const PUT = async (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, "save", (await context.params).id);
