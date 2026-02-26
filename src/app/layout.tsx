import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "KalExam - Exam kal hai? We got you.",
  description: "AI-powered study session plan from your syllabus and notes.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          theme="dark"
          richColors
          position="bottom-center"
          toastOptions={{
            className: "!bg-neutral-900 !border !border-white/10 !text-white",
          }}
        />
      </body>
    </html>
  );
}
