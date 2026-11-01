CREATE TABLE saved_mentors (
                               student_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                               mentor_id  TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
                               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                               PRIMARY KEY (student_id, mentor_id)
);

-- personal career goals, not the program goals in the goals table
CREATE TABLE student_goals (
                               id          TEXT PRIMARY KEY CHECK (length(id) = 36),
                               student_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                               title       TEXT NOT NULL,
                               target_date TEXT,
                               progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
                               created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                               updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_student_goals_student ON student_goals (student_id, created_at DESC);
