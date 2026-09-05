import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescript from "eslint-config-next/typescript"

const config = [
  { ignores: [".next/**", "node_modules/**", "site/**", "vendor/**", "test-results/**", "playwright-report/**"] },
  ...coreWebVitals,
  ...typescript,
]

export default config
