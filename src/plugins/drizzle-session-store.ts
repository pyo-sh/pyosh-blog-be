import { SessionStore } from "@fastify/session";
import { eq } from "drizzle-orm";
import { db } from "@src/db/client";
import { sessionTable } from "@src/db/schema";

/**
 * Drizzle 기반 SessionStore 구현
 * @fastify/session의 SessionStore 인터페이스 구현
 */
export class DrizzleSessionStore implements SessionStore {
  async get(
    sessionId: string,
    callback: (err?: Error, result?: { [key: string]: unknown }) => void,
  ): Promise<void> {
    try {
      const [session] = await db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.id, sessionId))
        .limit(1);

      if (!session) {
        return callback(undefined, undefined);
      }

      // 만료 확인
      const now = Math.floor(Date.now() / 1000);
      if (session.expiresAt < now) {
        // 만료된 세션 삭제
        await db.delete(sessionTable).where(eq(sessionTable.id, sessionId));

        return callback(undefined, undefined);
      }

      // 세션 데이터 파싱
      const data = JSON.parse(session.data);
      callback(undefined, data);
    } catch (err) {
      callback(err as Error);
    }
  }

  async set(
    sessionId: string,
    session: { [key: string]: unknown },
    callback: (err?: Error) => void,
  ): Promise<void> {
    try {
      const data = JSON.stringify(session);
      const expiresAt =
        session.cookie &&
        typeof session.cookie === "object" &&
        "expires" in session.cookie
          ? Math.floor(
              new Date(session.cookie.expires as string).getTime() / 1000,
            )
          : Math.floor(Date.now() / 1000) + 86400; // 기본 24시간

      // INSERT or UPDATE (ON DUPLICATE KEY UPDATE)
      await db
        .insert(sessionTable)
        .values({ id: sessionId, data, expiresAt })
        .onDuplicateKeyUpdate({ set: { data, expiresAt } });

      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  async destroy(
    sessionId: string,
    callback: (err?: Error) => void,
  ): Promise<void> {
    try {
      await db.delete(sessionTable).where(eq(sessionTable.id, sessionId));
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}
