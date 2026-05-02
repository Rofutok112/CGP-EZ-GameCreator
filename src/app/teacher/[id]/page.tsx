import Link from "next/link";
import { SubmissionViewer } from "./SubmissionViewer";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Live Detail</h1>
          <span>Auto Refresh</span>
        </div>
        <Link href="/teacher">List</Link>
      </header>
      <section className="teacher-main teacher-detail-main">
        <SubmissionViewer clientId={id} />
      </section>
    </main>
  );
}
