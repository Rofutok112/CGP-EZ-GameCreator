import Link from "next/link";
import { LiveSessionsTable } from "./LiveSessionsTable";

export default function TeacherPage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Teacher</h1>
          <span>Live Monitor</span>
        </div>
        <Link href="/">Student</Link>
      </header>
      <section className="teacher-main">
        <LiveSessionsTable />
      </section>
    </main>
  );
}
