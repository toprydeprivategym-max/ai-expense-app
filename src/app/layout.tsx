import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ai経費識別君 - AI経費管理チャット",
  description: "チャット形式でレシート写真をアップロードし、AIが自動で経費を認識・分類します",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
