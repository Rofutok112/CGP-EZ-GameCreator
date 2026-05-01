import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { submissions } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "提出IDが正しくありません。" }, { status: 400 });
  }

  const db = getDb();
  const row = db.select().from(submissions).where(eq(submissions.id, numericId)).get();
  if (!row) {
    return NextResponse.json({ error: "提出が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(row);
}
