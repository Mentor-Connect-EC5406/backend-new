-- programs start as a student request: adds PENDING and DECLINED (SQLite cannot change a CHECK, so the table is rebuilt)
PRAGMA defer_foreign_keys = true;

CREATE TABLE mentorship_programs_new (
                                         id              TEXT PRIMARY KEY CHECK (length(id) = 36),
                                         student_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                                         mentor_id       TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
                                         title           TEXT NOT NULL,
                                         description     TEXT,
                                         duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12, 24, 48)),
                                         start_date      TEXT NOT NULL,
                                         end_date        TEXT NOT NULL,
                                         status          TEXT NOT NULL DEFAULT 'PENDING'
                                             CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DECLINED')),
                                         created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                         updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                         CHECK (end_date > start_date)
);

INSERT INTO mentorship_programs_new SELECT * FROM mentorship_programs;
DROP TABLE mentorship_programs;
ALTER TABLE mentorship_programs_new RENAME TO mentorship_programs;

CREATE INDEX idx_programs_student ON mentorship_programs (student_id, status);
CREATE INDEX idx_programs_mentor  ON mentorship_programs (mentor_id, status);
CREATE INDEX idx_programs_pending ON mentorship_programs (status, start_date);

-- one open request or program per student and mentor
CREATE UNIQUE INDEX uq_programs_open ON mentorship_programs (student_id, mentor_id) WHERE status IN ('PENDING', 'ACTIVE');
