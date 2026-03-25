CREATE TABLE waitlist (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  email     TEXT    NOT NULL UNIQUE,
  country   TEXT,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_waitlist_email    ON waitlist (email);
CREATE INDEX idx_waitlist_joined_at ON waitlist (joined_at);
