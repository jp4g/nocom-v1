import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ghost Protocol | Privacy Money Market",
  description: "Supply and borrow assets with complete anonymity. Ghost Protocol utilizes zk-SNARKs to shield your balance and transaction history on-chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} bg-dark text-neutral-400 font-sans antialiased min-h-screen`}
      >
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
