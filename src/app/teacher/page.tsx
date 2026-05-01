import Link from "next/link";
import { LiveSessionsTable } from "./LiveSessionsTable";

export default function TeacherPage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>先生画面</h1>
          <span>リアルタイム確認</span>
        </div>
        <Link href="/">生徒画面へ</Link>
      </header>
      <section className="teacher-main">
        <LiveSessionsTable />
      </section>
    </main>
  );
}
