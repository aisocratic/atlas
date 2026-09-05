import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import { fontClassName } from "./fonts"
import { ThemeProvider } from "@/components/theme-provider"
import { AppFooter, AppHeader } from "@/components/app-chrome"

export const metadata: Metadata = {
  title: "Atlas — engineering telemetry",
  description: "A self-hostable engineering and web-ops dashboard.",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={fontClassName} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-body text-foreground antialiased">
        <ThemeProvider attribute="class" storageKey="atlas-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppHeader />
          {children}
          <AppFooter />
        </ThemeProvider>
      </body>
    </html>
  )
}
