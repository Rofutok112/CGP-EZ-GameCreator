import { NextResponse } from "next/server";

export function requireTeacherToken(request: Request) {
  const expected = process.env.TEACHER_TOKEN || "teacher";
  const url = new URL(request.url);
  const provided = url.searchParams.get("token") || request.headers.get("x-teacher-token") || "";
  if (provided === expected) return null;
  return NextResponse.json({ error: "先生用トークンが必要です。" }, { status: 401 });
}

export function classroomFromRequest(request: Request) {
  const url = new URL(request.url);
  return (url.searchParams.get("classroomId") || "default").trim() || "default";
}
