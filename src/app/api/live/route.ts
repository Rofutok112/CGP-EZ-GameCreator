import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { liveSessions } from "@/db/schema";
import { classroomFromRequest, requireTeacherToken } from "@/lib/teacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const authError = requireTeacherToken(request);
  if (authError) return authError;
  const classroomId = classroomFromRequest(request);
  const rows = getDb()
    .select()
    .from(liveSessions)
    .where(and(eq(liveSessions.classroomId, classroomId), isNull(liveSessions.archivedAt)))
    .orderBy(desc(liveSessions.updatedAt))
    .all();
  return jsonNoStore(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    clientId?: string;
    classroomId?: string;
    studentName?: string;
    title?: string;
    code?: string;
    revision?: number;
    clientUpdatedAt?: string;
  };

  const clientId = body.clientId?.trim();
  if (!clientId || body.code === undefined) {
    return NextResponse.json({ error: "同期IDとコードが必要です。" }, { status: 400 });
  }

  const now = new Date();
  const classroomId = body.classroomId?.trim() || "default";
  const revision = Number.isFinite(body.revision) ? Number(body.revision) : 0;
  const clientUpdatedAt = body.clientUpdatedAt ? new Date(body.clientUpdatedAt) : now;
  const db = getDb();
  const existing = db.select().from(liveSessions).where(eq(liveSessions.clientId, clientId)).get();
  if (
    existing &&
    !existing.archivedAt &&
    existing.classroomId === classroomId &&
    (revision < existing.revision || (revision === existing.revision && clientUpdatedAt.getTime() < existing.clientUpdatedAt.getTime()))
  ) {
    return jsonNoStore({ ...existing, ignored: true });
  }

  const values = {
    clientId,
    classroomId,
    studentName: body.studentName?.trim() || "名前未設定",
    title: body.title?.trim() || "無題のゲーム",
    code: body.code,
    revision,
    clientUpdatedAt,
    archivedAt: null,
    updatedAt: now
  };

  if (existing) {
    const updated = db
      .update(liveSessions)
      .set(values)
      .where(eq(liveSessions.clientId, clientId))
      .returning()
      .get();
    return jsonNoStore(updated);
  }

  const inserted = db
    .insert(liveSessions)
    .values({ ...values, createdAt: now })
    .returning()
    .get();
  return jsonNoStore(inserted, { status: 201 });
}

export async function DELETE(request: Request) {
  const authError = requireTeacherToken(request);
  if (authError) return authError;
  const classroomId = classroomFromRequest(request);
  const url = new URL(request.url);
  const olderThanMinutes = Number(url.searchParams.get("olderThanMinutes") ?? "0");
  const now = new Date();
  const where =
    olderThanMinutes > 0
      ? and(eq(liveSessions.classroomId, classroomId), lt(liveSessions.updatedAt, new Date(Date.now() - olderThanMinutes * 60_000)))
      : eq(liveSessions.classroomId, classroomId);
  const rows = getDb().update(liveSessions).set({ archivedAt: now }).where(where).returning().all();
  return jsonNoStore({ archived: rows.length });
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
