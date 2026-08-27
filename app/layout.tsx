import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { TopNav } from "@/components/nav/TopNav";
import { SettingsProvider } from "@/hooks/useSettings";
import { ResultsSync } from "@/hooks/useResultsSync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TypeFlow — Typing Speed Test",
  description:
    "A fast, focused typing speed test with live WPM, accuracy tracking, and a results dashboard.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

/**
 * Runs before first paint so the stored theme and accent are already applied.
 * Without it the page flashes the default palette on every load.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var raw = localStorage.getItem('typeflow.settings');
    if (!raw) { document.documentElement.setAttribute('data-theme', 'dark'); return; }
    var settings = (JSON.parse(raw) || {}).data || {};
    var theme = settings.theme || 'dark';
    if (theme !== 'system') document.documentElement.setAttribute('data-theme', theme);
    var accents = { violet: '#7C5CFF', blue: '#3B82F6', emerald: '#10B981', amber: '#F59E0B' };
    var accent = accents[settings.accent] || accents.violet;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-soft', 'color-mix(in srgb, ' + accent + ' 16%, transparent)');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  // `data-theme="dark"` is the app's default, so the very first paint is already
  // correct for most visitors; the bootstrap script corrects light and system users.
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script
          id="typeflow-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
        <SettingsProvider>
          <ResultsSync>
            <TopNav />
            <main className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</main>
          </ResultsSync>
        </SettingsProvider>
      </body>
    </html>
  );
}
