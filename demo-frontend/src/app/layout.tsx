import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Nota POS — Demo",
  description: "Prototype interaktif Nota POS (data dummy) — sistem kasir, stok, keuangan & analitik dalam satu tempat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable} font-body bg-paper text-ink antialiased`} style={{ height: "100%", margin: 0 }}>
        <div id="root" style={{ height: "100%" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
