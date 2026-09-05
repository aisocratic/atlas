export type TelemetryPresentation = {
  source: string
  description: string
  metrics: { label: string; value: string }[]
  columns: string[]
  rows: (string | number | null)[][]
  links?: { label: string; href: string }[]
}
