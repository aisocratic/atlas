import { authorizeRequest } from "../../../../lib/auth"
import { createCardHandlers } from "../../../../lib/cards/handlers"
import { getCardServices } from "../../../../lib/cards/runtime"

export const runtime = "nodejs"
const handlers = createCardHandlers({ authorize: authorizeRequest, services: getCardServices })
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.collect(request, (await context.params).id)
}
