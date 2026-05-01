import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { submissions } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = db.select().from(submissions).orderBy(desc(submissions.createdAt)).all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { studentName?: string; title?: string; code?: string };
  const studentName = body.studentName?.trim();
  const title = body.title?.trim();
  const code = body.code?.trim();

  if (!studentName || !title || !code) {
    return NextResponse.json({ error: "名前、作品名、コードを入力してください。" }, { status: 400 });
  }

  const now = new Date();
  const db = getDb();
  const inserted = db
    .insert(submissions)
    .values({ studentName, title, code, createdAt: now, updatedAt: now })
    .returning()
    .get();

  return NextResponse.json(inserted, { status: 201 });
}
