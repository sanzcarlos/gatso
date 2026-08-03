import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineSyncManager } from "@/components/offline-sync-manager";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gatso",
  description: "Control de gastos compartidos entre amigos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gatso",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090d14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton />
          <ServiceWorkerRegister />
          <InstallPrompt />
          <OfflineSyncManager />
        </ThemeProvider>
      </body>
    </html>
  );
}
