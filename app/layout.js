import "./globals.css";
import aocIcon from "@/aoc-icon.png";
import DebuggerGate from "@/components/debugger/gate";
import { Suspense } from "react";

export const metadata = {
  title: "AOC Client Portal",
  description: "Always Open Commerce client portal and AOC-GPT assistant",
  icons: { icon: aocIcon.src, apple: aocIcon.src },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#075596",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><Suspense fallback={null}><DebuggerGate /></Suspense>{children}</body>
    </html>
  );
}
