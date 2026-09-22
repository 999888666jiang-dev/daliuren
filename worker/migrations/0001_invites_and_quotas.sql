CREATE TABLE invitations (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);

-- Only anonymous access/quota metadata. Never store a question, chart, location or response.
CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  invite_hash TEXT NOT NULL REFERENCES invitations(token_hash),
  quota_day TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX ai_requests_day ON ai_requests(quota_day);
CREATE INDEX ai_requests_invite_day ON ai_requests(invite_hash, quota_day);
CREATE INDEX ai_requests_active ON ai_requests(invite_hash, finished_at, started_at);
