export type AssignmentStatus = 'pending' | 'acknowledged' | 'snoozed' | 'completed' | 'reassigned';

export type User = {
  id: string;
  github_username: string;
  slack_user_id: string | null;
  display_name: string | null;
  extension_token: string;
  created_at: string;
};

export type PullRequest = {
  id: string;
  repo_full_name: string;
  pr_number: number;
  title: string;
  url: string;
  author_github: string;
  state: string;
  is_draft: number;
  requested_reviewers_json: string;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RepositoryWatch = {
  id: string;
  repo_full_name: string;
  slack_channel_id: string;
  enabled: number;
  notify_drafts: number;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

export type ChannelNotification = {
  id: string;
  pr_id: string;
  repository_watch_id: string;
  slack_channel_id: string;
  slack_root_ts: string;
  last_known_pr_status: string;
  posted_at: string;
  updated_at: string;
};

export type ReviewAssignment = {
  id: string;
  pr_id: string;
  reviewer_github: string;
  status: AssignmentStatus;
  assigned_at: string;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  completed_at: string | null;
  slack_ts: string | null;
  last_notified_at: string | null;
  last_reminded_at: string | null;
  reminder_count: number;
};
