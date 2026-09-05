import { loginHandler } from "@/lib/auth/login"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const POST = loginHandler()
