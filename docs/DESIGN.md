# Application design substrate

Atlas imports the vendored `@aisocratic/design` archive recorded in
`vendor/design.json`. The warm light and dark colors, spacing, typography,
surfaces, radii, focus styles, and control recipes come from that package.
`app/globals.css` imports Tailwind first, the shared theme second, and scans the
package's component classes. Use semantic classes such as `bg-card`,
`text-muted-foreground`, `border-border`, `font-body`, `font-display`, and
`font-code`; `font-sans` is not the shared body slot.

The application consumes shared `SiteHeader`, `PageHeader`, `SegmentedControl`,
`Button`, `MetricCard`, `cardSurface`, and the brand `LogoMark` directly. Header,
main content, and footer use `page-shell` so their gutters and content measure
align. `components/app-chrome.tsx` owns the compact application header/footer;
the dashboard owns its content. A keyboard skip link targets `main-content`.

## Fonts

`app/fonts.ts` uses `next/font/local` and applies all three generated variables
to the root `html` element, so portals and all routes inherit them:

| Role | Family | CSS slot | Weights/styles |
| --- | --- | --- | --- |
| Body | Space Grotesk | `--aisocratic-font-body` | Variable 300–700, normal |
| Display | Newsreader | `--aisocratic-font-display` | 200, normal and true italic |
| Code | JetBrains Mono | `--aisocratic-font-code` | Variable 400–500, normal |

Original font files and full OFL-1.1 notices are in `app/font-assets/`. The
manifest pins the Google Fonts repository revision, exact source URLs, and
SHA-256 hashes for all seven font/license files. Sources are the official
[Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk),
[Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader), and
[JetBrains Mono](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono)
directories. No licensed Sentient asset is included. Builds and browser font
loading require no font-provider network access.

`pnpm design:check` verifies the design archive, static stylesheet, and font
assets. When changing fonts, retain each original license, update provenance
and hashes, and check the three computed font families in the app browser suite.

## Appearance

The `next-themes` provider defaults to the operating system's appearance and
stores explicit Light, Dark, or System preferences in `atlas-theme`. The shared
segmented control exposes pressed state and works with keyboard activation.
System continues following OS changes; an explicit choice survives reload and
takes precedence over OS changes. Theme-aware markup uses a stable server
snapshot to avoid hydration mismatch, and the provider initializes the root
class before hydration.

Run application substrate checks with:

```sh
pnpm verify
pnpm test:e2e:app
# If using installed Chrome:
PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e:app
```

The suite builds and starts its own application server on port 4180. The
independent Pages browser suite remains `pnpm test:e2e` on port 4176.
