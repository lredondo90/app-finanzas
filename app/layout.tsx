import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mis Finanzas",
  description: "Presupuesto mensual, gastos e inversión",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // pantalla completa en iPhone (notch / Dynamic Island)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#072146" },
    { media: "(prefers-color-scheme: dark)", color: "#041634" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
