import type { Metadata } from "next";
import "./globals.css";

// ▼ サイトのタイトル・説明。Claude Code に「タイトルを◯◯に変えて」と頼めば書き換わる。
export const metadata: Metadata = {
  title: "はじめてのツール",
  description: "Claude Code で作った、自分の事業のツール",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
