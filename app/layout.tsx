import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI English Speaking Coach",
  description: "Scenario-based AI English speaking practice with feedback reports"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
