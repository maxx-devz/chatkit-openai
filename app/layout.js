import "./globals.css";

export const metadata = {
  title: "AOC Client Portal",
  description: "Always Open Commerce client portal and AI assistant prototype",
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
