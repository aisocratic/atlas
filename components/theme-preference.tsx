"use client"

import { SegmentedControl } from "@aisocratic/design/components/segmented-control"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

export function ThemePreference() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  return (
    <div role="group" aria-label="Color theme">
      <SegmentedControl options={options} value={mounted ? theme ?? "system" : null} onValueChange={setTheme} />
    </div>
  )
}
