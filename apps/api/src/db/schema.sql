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
