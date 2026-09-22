import { ApiError } from "./types";

export const INVITE_DAILY_LIMIT = 10;
export const GLOBAL_DAILY_LIMIT = 100;
export const LEASE_SECONDS = 40;

export function quotaDay(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function hashInvite(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`liuren-invite-v1\0${token}`),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticate(
  db: D1Database,
  authorization: string | null,
): Promise<string> {
  const match = authorization?.match(/^Bearer (lr_[A-Za-z0-9_-]{43})$/u);
  if (!match)
    throw new ApiError(401, "INVALID_INVITE", "请输入有效的亲友邀请码。");
  const hash = await hashInvite(match[1]);
  const invite = await db
    .prepare(
      "SELECT token_hash FROM invitations WHERE token_hash = ?1 AND revoked_at IS NULL",
    )
    .bind(hash)
    .first();
  if (!invite)
    throw new ApiError(401, "INVALID_INVITE", "邀请码无效或已停用。");
  return hash;
}

// A single conditional INSERT does the read/check/write atomically inside SQLite.
// There is no separate count-then-increment race between concurrent Worker isolates.
export const RESERVE_SQL = `
INSERT INTO ai_requests (id, invite_hash, quota_day, started_at)
SELECT ?1, ?2, ?3, ?4
WHERE EXISTS (SELECT 1 FROM invitations WHERE token_hash = ?2 AND revoked_at IS NULL)
  AND (SELECT COUNT(*) FROM ai_requests WHERE invite_hash = ?2 AND quota_day = ?3) < ?5
  AND (SELECT COUNT(*) FROM ai_requests WHERE quota_day = ?3) < ?6
  AND NOT EXISTS (SELECT 1 FROM ai_requests WHERE invite_hash = ?2 AND finished_at IS NULL AND started_at > ?7)
RETURNING id`;

export async function reserve(
  db: D1Database,
  inviteHash: string,
  now = Date.now(),
): Promise<string> {
  const seconds = Math.floor(now / 1000);
  // No questions, coordinates, charts or responses are persisted. Only seven days of quota metadata.
  await db
    .prepare("DELETE FROM ai_requests WHERE started_at < ?1")
    .bind(seconds - 7 * 86400)
    .run();
  const id = crypto.randomUUID();
  const result = await db
    .prepare(RESERVE_SQL)
    .bind(
      id,
      inviteHash,
      quotaDay(now),
      seconds,
      INVITE_DAILY_LIMIT,
      GLOBAL_DAILY_LIMIT,
      seconds - LEASE_SECONDS,
    )
    .first<{ id: string }>();
  if (result) return result.id;
  const enabled = await db
    .prepare(
      "SELECT token_hash FROM invitations WHERE token_hash = ?1 AND revoked_at IS NULL",
    )
    .bind(inviteHash)
    .first();
  if (!enabled)
    throw new ApiError(401, "INVALID_INVITE", "邀请码无效或已停用。");
  const inflight = await db
    .prepare(
      "SELECT id FROM ai_requests WHERE invite_hash = ?1 AND finished_at IS NULL AND started_at > ?2 LIMIT 1",
    )
    .bind(inviteHash, seconds - LEASE_SECONDS)
    .first();
  if (inflight)
    throw new ApiError(
      429,
      "REQUEST_IN_FLIGHT",
      "已有解读正在进行，请稍后查看。",
    );
  throw new ApiError(
    429,
    "QUOTA_EXCEEDED",
    "今日解读额度已用完，课盘和古籍原文仍可使用。",
  );
}

export async function finish(
  db: D1Database,
  requestId: string,
  now = Date.now(),
): Promise<void> {
  await db
    .prepare("UPDATE ai_requests SET finished_at = ?1 WHERE id = ?2")
    .bind(Math.floor(now / 1000), requestId)
    .run();
}
