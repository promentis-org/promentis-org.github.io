CREATE TABLE IF NOT EXISTS individual_feedback (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) BETWEEN 1 AND 120),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  moderated_at TEXT,
  moderated_by TEXT,
  CHECK ((status = 'approved' AND approved = 1) OR (status <> 'approved' AND approved = 0))
);
CREATE INDEX IF NOT EXISTS feedback_public ON individual_feedback (recipient_id, approved, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS feedback_queue ON individual_feedback (status, created_at DESC, id DESC);
