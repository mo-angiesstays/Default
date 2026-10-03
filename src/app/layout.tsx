import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

/**
 * Fraunces for headings — a soft, slightly organic serif that carries the
 * warmth the palette is going for. Inter for everything a cleaner reads on a
 * phone in bad light, where legibility beats character.
 */
const display = Fraunces({
  subsets: ["latin"],
  // Variable font: the full weight range comes for free, and SOFT rounds the
  // terminals a little, which is most of where the warmth comes from.
  axes: ["SOFT"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TurnKeep — property operations",
  description:
    "Turnovers, deep cleans, maintenance, issues and scheduling for short-term rentals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#28231a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
