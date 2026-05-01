import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { liveSessions } from "@/db/schema";
import { requireTeacherToken } from "@/lib/teacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const authError = requireTeacherToken(request);
  if (authError) return authError;
  const { clientId } = await params;
  const row = getDb().select().from(liveSessions).where(eq(liveSessions.clientId, clientId)).get();
  if (!row || row.archivedAt) {
    return jsonNoStore({ error: "リアルタイム共有が見つかりません。" }, { status: 404 });
  }
  return jsonNoStore(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const authError = requireTeacherToken(request);
  if (authError) return authError;
  const { clientId } = await params;
  const row = getDb()
    .update(liveSessions)
    .set({ archivedAt: new Date() })
    .where(eq(liveSessions.clientId, clientId))
    .returning()
    .get();
  if (!row) return jsonNoStore({ error: "リアルタイム共有が見つかりません。" }, { status: 404 });
  return jsonNoStore(row);
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
