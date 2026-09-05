import localFont from "next/font/local"

// Vendored OFL faces keep builds and runtime independent of a font service.
// Sources, hashes, and the unmodified licenses are in font-assets/.
export const body = localFont({
  src: "./font-assets/space-grotesk.ttf",
  weight: "300 700",
  display: "swap",
  variable: "--aisocratic-font-body",
  fallback: ["Arial", "sans-serif"],
})

export const display = localFont({
  src: [
    { path: "./font-assets/newsreader.ttf", weight: "200", style: "normal" },
    { path: "./font-assets/newsreader-italic.ttf", weight: "200", style: "italic" },
  ],
  display: "swap",
  variable: "--aisocratic-font-display",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
})

export const code = localFont({
  src: "./font-assets/jetbrains-mono.ttf",
  weight: "400 500",
  display: "swap",
  variable: "--aisocratic-font-code",
  fallback: ["Courier New", "monospace"],
})

export const fontClassName = `${body.variable} ${display.variable} ${code.variable}`
