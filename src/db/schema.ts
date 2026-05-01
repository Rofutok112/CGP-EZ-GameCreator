import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const submissions = sqliteTable("submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentName: text("student_name").notNull(),
  title: text("title").notNull(),
  code: text("code").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export type Submission = typeof submissions.$inferSelect;

export const liveSessions = sqliteTable("live_sessions", {
  clientId: text("client_id").primaryKey(),
  classroomId: text("classroom_id").notNull(),
  studentName: text("student_name").notNull(),
  title: text("title").notNull(),
  code: text("code").notNull(),
  revision: integer("revision").notNull(),
  clientUpdatedAt: integer("client_updated_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" })
});

export type LiveSession = typeof liveSessions.$inferSelect;
