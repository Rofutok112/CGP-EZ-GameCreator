import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CGP EZ GameCreator",
  description: "C#風DSLでゲームを作る新歓向けエディタ"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
