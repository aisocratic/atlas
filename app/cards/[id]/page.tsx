import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePageAuth } from "../../../lib/auth/server"
import { getCardServices } from "../../../lib/cards/runtime"
import { cardComponents } from "../../../cards/components"
export const dynamic = "force-dynamic"
export default async function CardDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAuth()
  const { id } = await params, View = cardComponents[id]
  if (!View) notFound()
  const dataset = await getCardServices().dataset(id)
  return <main id="main-content" tabIndex={-1} className="page-shell flex-1 space-y-6 py-10"><Link href="/" className="underline">Back to dashboards</Link><View dataset={dataset} /></main>
}
