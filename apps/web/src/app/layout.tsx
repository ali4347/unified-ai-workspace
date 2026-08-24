import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Unified AI Workspace",
    template: "%s · Unified AI Workspace",
  },
  description:
    "One workspace above your AI providers. Start with one AI. Switch to another. Keep the same work.",
};

// Applies the theme before first paint to avoid a flash. Full Light/Dark/System
// switcher UI ships with Milestone 2 (PRD §40); until then we follow the system.
const themeScript = `(function () {
  try {
    var stored = localStorage.getItem("uaw-theme");
    var dark =
      stored === "dark" ||
      ((!stored || stored === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
