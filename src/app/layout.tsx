import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISF 2026 · Judging",
  description: "Indian Scroll Festival 2026 · live judging system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://use.typekit.net/xfk5kyc.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
