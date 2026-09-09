import "./globals.css";
import aocIcon from "@/aoc-icon.png";

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
      <body>{children}</body>
    </html>
  );
}
