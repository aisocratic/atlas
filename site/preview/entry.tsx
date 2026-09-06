import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { AnalyticsPreview } from "../../components/analytics/analytics-preview";
import "./preview.css";

function Preview() {
  const { theme, setTheme } = useTheme();
  return <><header className="preview-site-header"><a href="../">Atlas</a><div role="group" aria-label="Color theme">{["light", "dark", "system"].map(value => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value}</button>)}</div></header><AnalyticsPreview homeHref="./" /></>;
}
createRoot(document.getElementById("root")!).render(<ThemeProvider attribute="class" storageKey="atlas-theme" defaultTheme="dark" enableSystem><Preview /></ThemeProvider>);
