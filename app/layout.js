import "./globals.css";

export const metadata = {
  title: "AOC Assistant",
  description: "Always Open Commerce client AI portal prototype",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

