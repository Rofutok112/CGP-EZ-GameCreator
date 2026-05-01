import Link from "next/link";
import { SubmissionViewer } from "./SubmissionViewer";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>リアルタイム確認</h1>
          <span>生徒の現在のコードを自動更新します</span>
        </div>
        <Link href="/teacher">一覧へ</Link>
      </header>
      <section className="teacher-main teacher-detail-main">
        <SubmissionViewer clientId={id} />
      </section>
    </main>
  );
}
