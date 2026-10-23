import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";
const DESCRIPTION =
  "TravelTomo turns travel in the Philippines into a game: roll the dice, visit local spots, complete quests and collect stamps to win free food, drinks and discounts from local businesses.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TravelTomo — Travel Quests & Rewards in the Philippines",
    template: "%s — TravelTomo",
  },
  description: DESCRIPTION,
  applicationName: "TravelTomo",
  keywords: [
    "TravelTomo",
    "Philippines travel app",
    "travel quests",
    "food trip",
    "stamp card",
    "loyalty rewards",
    "things to do in Angeles City",
    "Pampanga travel",
    "local deals",
    "travel game",
  ],
  openGraph: {
    type: "website",
    siteName: "TravelTomo",
    title: "TravelTomo — Travel Quests & Rewards in the Philippines",
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/icon-1024.png", width: 1024, height: 1024, alt: "TravelTomo" }],
    locale: "en_PH",
  },
  twitter: {
    card: "summary",
    title: "TravelTomo — Travel Quests & Rewards in the Philippines",
    description: DESCRIPTION,
    images: ["/icon-1024.png"],
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-white">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
