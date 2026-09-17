import type { Metadata, Viewport } from "next";
import { Anton, DM_Sans, JetBrains_Mono } from "next/font/google";

import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/misc";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Display face — condensed ultrabold, used for headings and hero numerals only.
const displayFont = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fee-Nance",
    template: "%s · Fee-Nance",
  },
  description:
    "Track your income and expenses, split costs with groups, and settle up — in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable:false — pinch zoom stays available.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e2e2df" },
    { media: "(prefers-color-scheme: dark)", color: "#070607" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthSessionProvider>
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster />
            </TooltipProvider>
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
