CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_username TEXT UNIQUE NOT NULL,
  slack_user_id TEXT,
  display_name TEXT,
  extension_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author_github TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  is_draft INTEGER NOT NULL DEFAULT 0,
  requested_reviewers_json TEXT NOT NULL DEFAULT '[]',
  merged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_full_name, pr_number)
);

CREATE TABLE IF NOT EXISTS review_assignments (
  id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL,
  reviewer_github TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  snoozed_until TEXT,
  completed_at TEXT,
  slack_ts TEXT,
  last_notified_at TEXT,
  last_reminded_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(pr_id) REFERENCES pull_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_reviewer_status ON review_assignments(reviewer_github, status);
CREATE INDEX IF NOT EXISTS idx_assignments_pr ON review_assignments(pr_id);

CREATE TABLE IF NOT EXISTS daily_digest_runs (
  digest_date TEXT PRIMARY KEY,
  open_pr_count INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repository_watches (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  slack_channel_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  notify_drafts INTEGER NOT NULL DEFAULT 0 CHECK (notify_drafts IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_repository_watches_enabled ON repository_watches(enabled);

CREATE TABLE IF NOT EXISTS channel_notifications (
  id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL,
  repository_watch_id TEXT NOT NULL,
  slack_channel_id TEXT NOT NULL,
  slack_root_ts TEXT NOT NULL,
  last_known_pr_status TEXT NOT NULL,
  posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pr_id, repository_watch_id),
  FOREIGN KEY(pr_id) REFERENCES pull_requests(id),
  FOREIGN KEY(repository_watch_id) REFERENCES repository_watches(id)
);

CREATE INDEX IF NOT EXISTS idx_channel_notifications_watch ON channel_notifications(repository_watch_id);
