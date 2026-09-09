import { LogoMark } from "@aisocratic/design/brand";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { AnalyticsPreview } from "../../components/analytics/analytics-preview";
import "./preview.css";
import { ProjectFooter } from "../../components/project-footer";

function Preview() {
  const { theme, setTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  return <><header className="preview-site-header"><a href="../" aria-label="Atlas home"><LogoMark size={24} aria-hidden="true" />Atlas</a><nav aria-label="Primary" className={menu ? "demo-navigation open" : "demo-navigation"}><a href="../#overview">Overview</a><a href="../#features">Features</a><a href="../demo/" aria-current="page">Demo</a><a href="https://github.com/aisocratic/atlas">GitHub</a></nav><div className="demo-header-actions"><div role="group" aria-label="Color theme">{["light", "dark", "system"].map(value => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value}</button>)}</div><button className="demo-menu-button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button></div></header><div className="demo-intro"><span>Interactive demo</span><p>Explore 20 sample cards. Try a filter, expand a chart, or choose Edit to arrange your workspace.</p><a href="https://github.com/aisocratic/atlas/blob/main/docs/DEPLOYMENT.md">Self-host Atlas ↗</a></div><AnalyticsPreview homeHref="../" /><ProjectFooter homeHref="../" /></>;
}
createRoot(document.getElementById("root")!).render(<ThemeProvider attribute="class" storageKey="atlas-theme" defaultTheme="dark" enableSystem><Preview /></ThemeProvider>);
