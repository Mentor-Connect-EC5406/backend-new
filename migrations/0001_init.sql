-- MentorConnect Edge API schema: all tables merged from docs/database/schema
-- ids from other source services stay logical (no cross-service FK)

-- ===== user =====
-- user-service (user_service.db) Port 8081
-- Owns: users, student_profiles

CREATE TABLE users (
                       id                TEXT PRIMARY KEY CHECK (length(id) = 36),
                       external_auth_id  TEXT NOT NULL UNIQUE,                 -- Asgardeo "sub" claim
                       email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
                       password_hash     TEXT NOT NULL,
                       first_name        TEXT NOT NULL,
                       last_name         TEXT NOT NULL,
                       phone             TEXT,
                       profile_image_key TEXT,                                 -- Cloudflare R2 object key
                       role              TEXT NOT NULL
                           CHECK (role IN ('STUDENT', 'MENTOR', 'ADMIN')),
                       account_status    TEXT NOT NULL DEFAULT 'ACTIVE'
                           CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
                       created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                       updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_status ON users (account_status);

-- One profile per STUDENT user (users 1 : 0..1 student_profiles)
CREATE TABLE student_profiles (
                                  id            TEXT PRIMARY KEY CHECK (length(id) = 36),
                                  user_id       TEXT NOT NULL UNIQUE
                                      REFERENCES users (id) ON DELETE CASCADE,
                                  university    TEXT,
                                  faculty       TEXT,
                                  degree        TEXT,
                                  academic_year INTEGER CHECK (academic_year BETWEEN 1 AND 10),
                                  bio           TEXT,
                                  interests     TEXT,
                                  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ===== mentor =====
-- mentor-service (mentor_service.db) Port 8082
-- Owns: mentors, expertise taxonomy, availability_slots, mentor_verifications

CREATE TABLE mentors (
                         id                  TEXT PRIMARY KEY CHECK (length(id) = 36),
                         user_id             TEXT NOT NULL UNIQUE,               -- -> user-service.users.id (logical)
                         title               TEXT,
                         organization        TEXT,
                         industry            TEXT,
                         bio                 TEXT,
                         experience_years    INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
                         hourly_rate_cents   INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate_cents >= 0),
                         currency            TEXT NOT NULL DEFAULT 'USD',
                         rating_avg          REAL NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
                         rating_count        INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
                         verification_status TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
                         created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                         updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_mentors_verification ON mentors (verification_status);
CREATE INDEX idx_mentors_rating       ON mentors (rating_avg DESC);
CREATE INDEX idx_mentors_industry     ON mentors (industry);

-- ---------- Expertise taxonomy ----------
CREATE TABLE expertise_categories (
                                      id          TEXT PRIMARY KEY CHECK (length(id) = 36),
                                      name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
                                      description TEXT
);

CREATE TABLE expertises (
                            id          TEXT PRIMARY KEY CHECK (length(id) = 36),
                            category_id TEXT NOT NULL REFERENCES expertise_categories (id) ON DELETE RESTRICT,
                            name        TEXT NOT NULL COLLATE NOCASE,
                            description TEXT,
                            UNIQUE (category_id, name)
);

CREATE TABLE mentor_expertises (
                                   mentor_id    TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
                                   expertise_id TEXT NOT NULL REFERENCES expertises (id) ON DELETE RESTRICT,
                                   proficiency  TEXT NOT NULL DEFAULT 'INTERMEDIATE'
                                       CHECK (proficiency IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')),
                                   PRIMARY KEY (mentor_id, expertise_id)
);

CREATE INDEX idx_mentor_expertises_expertise ON mentor_expertises (expertise_id);

-- ---------- Availability ----------
CREATE TABLE availability_slots (
                                    id         TEXT PRIMARY KEY CHECK (length(id) = 36),
                                    mentor_id  TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
                                    start_time TEXT NOT NULL,                               -- UTC ISO-8601
                                    end_time   TEXT NOT NULL,                               -- UTC ISO-8601
                                    timezone   TEXT NOT NULL DEFAULT 'UTC',                 -- mentor display tz (IANA)
                                    status     TEXT NOT NULL DEFAULT 'AVAILABLE'
                                        CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED')),
                                    version    INTEGER NOT NULL DEFAULT 0,                  -- optimistic lock (@Version)
                                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                    CHECK (end_time > start_time),
                                    UNIQUE (mentor_id, start_time)
);

CREATE INDEX idx_slots_mentor_status_start ON availability_slots (mentor_id, status, start_time);
CREATE INDEX idx_slots_status_start        ON availability_slots (status, start_time);

-- ---------- Verification ----------
CREATE TABLE mentor_verifications (
                                      id            TEXT PRIMARY KEY CHECK (length(id) = 36),
                                      mentor_id     TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
                                      document_key  TEXT NOT NULL,                            -- Cloudflare R2 object key
                                      status        TEXT NOT NULL DEFAULT 'PENDING'
                                          CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
                                      reviewed_by   TEXT,                                     -- -> user-service.users.id (admin)
                                      review_note   TEXT,
                                      submitted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                      reviewed_at   TEXT
);

CREATE INDEX idx_verifications_mentor ON mentor_verifications (mentor_id);
CREATE INDEX idx_verifications_status ON mentor_verifications (status);

-- ===== booking =====

-- student_id, mentor_id, slot_id point to other services (no FK)
CREATE TABLE bookings (
                          id                  TEXT PRIMARY KEY CHECK (length(id) = 36),
                          student_id          TEXT NOT NULL,
                          mentor_id           TEXT NOT NULL,
                          slot_id             TEXT NOT NULL,
                          scheduled_start     TEXT NOT NULL,
                          scheduled_end       TEXT NOT NULL,
                          topic               TEXT,
                          price_cents         INTEGER NOT NULL CHECK (price_cents >= 0),
                          currency            TEXT NOT NULL DEFAULT 'USD',
                          status              TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED',
                                                'CANCELLED', 'RESCHEDULED', 'NO_SHOW')),
                          cancellation_reason TEXT,
                          rescheduled_from_id TEXT REFERENCES bookings (id),
                          expires_at          TEXT,
                          created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                          updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                          CHECK (scheduled_end > scheduled_start)
);

-- one live booking per slot (prevents double booking)
CREATE UNIQUE INDEX uq_bookings_active_slot
    ON bookings (slot_id)
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED');

CREATE INDEX idx_bookings_student   ON bookings (student_id, status);
CREATE INDEX idx_bookings_mentor    ON bookings (mentor_id, status);
CREATE INDEX idx_bookings_expiry    ON bookings (status, expires_at);
CREATE INDEX idx_bookings_scheduled ON bookings (scheduled_start);

CREATE TABLE mentoring_sessions (
                                    id               TEXT PRIMARY KEY CHECK (length(id) = 36),
                                    booking_id       TEXT NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
                                    meeting_url      TEXT,
                                    meeting_provider TEXT,
                                    actual_start     TEXT,
                                    actual_end       TEXT,
                                    status           TEXT NOT NULL DEFAULT 'SCHEDULED'
                                        CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
                                    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE reviews (
                         id         TEXT PRIMARY KEY CHECK (length(id) = 36),
                         booking_id TEXT NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
                         student_id TEXT NOT NULL,
                         mentor_id  TEXT NOT NULL,
                         rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                         comment    TEXT,
                         created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_reviews_mentor ON reviews (mentor_id, created_at DESC);

-- reviews allowed only for COMPLETED bookings
CREATE TRIGGER trg_reviews_require_completed
    BEFORE INSERT ON reviews
    FOR EACH ROW
    WHEN (SELECT status FROM bookings WHERE id = NEW.booking_id) IS NOT 'COMPLETED'
BEGIN
SELECT RAISE(ABORT, 'Review allowed only for COMPLETED bookings');
END;

-- ===== notification =====

-- user_id, sender_id point to the user service (no FK)
CREATE TABLE notifications (
                               id           TEXT PRIMARY KEY CHECK (length(id) = 36),
                               user_id      TEXT NOT NULL,
                               type         TEXT NOT NULL,
                               title        TEXT NOT NULL,
                               message      TEXT NOT NULL,
                               channel      TEXT NOT NULL
                                   CHECK (channel IN ('EMAIL', 'PUSH', 'IN_APP')),
                               status       TEXT NOT NULL DEFAULT 'PENDING'
                                   CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ')),
                               retry_count  INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
                               scheduled_at TEXT,
                               sent_at      TEXT,
                               read_at      TEXT,
                               created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notifications_user    ON notifications (user_id, status, created_at DESC);
CREATE INDEX idx_notifications_pending ON notifications (status, scheduled_at);

CREATE TABLE conversations (
                               id         TEXT PRIMARY KEY CHECK (length(id) = 36),
                               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE conversation_participants (
                                           conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                                           user_id         TEXT NOT NULL,
                                           joined_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                           PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_participants_user ON conversation_participants (user_id);

CREATE TABLE messages (
                          id              TEXT PRIMARY KEY CHECK (length(id) = 36),
                          conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                          sender_id       TEXT NOT NULL,
                          content         TEXT NOT NULL,
                          attachment_key  TEXT,
                          sent_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                          read_at         TEXT
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, sent_at);

-- ===== payment =====

-- booking_id, student_id point to other services (no FK)
CREATE TABLE payments (
                          id                   TEXT PRIMARY KEY CHECK (length(id) = 36),
                          booking_id           TEXT NOT NULL,
                          student_id           TEXT NOT NULL,
                          amount_cents         INTEGER NOT NULL CHECK (amount_cents > 0),
                          currency             TEXT NOT NULL DEFAULT 'USD',
                          provider             TEXT NOT NULL DEFAULT 'LEMON_SQUEEZY',
                          provider_checkout_id TEXT,
    -- unique id blocks duplicate webhook deliveries
                          transaction_id       TEXT UNIQUE,
                          status               TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
                          paid_at              TEXT,
                          created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                          updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_payments_booking ON payments (booking_id);
CREATE INDEX idx_payments_student ON payments (student_id, created_at DESC);
CREATE INDEX idx_payments_status  ON payments (status);

CREATE TABLE refunds (
                         id           TEXT PRIMARY KEY CHECK (length(id) = 36),
                         payment_id   TEXT NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
                         amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                         reason       TEXT,
                         admin_note   TEXT,
                         status       TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED')),
                         created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                         processed_at TEXT
);

CREATE INDEX idx_refunds_payment ON refunds (payment_id);

-- ===== mentorship =====

-- student_id, mentor_id point to other services (no FK)
CREATE TABLE mentorship_programs (
                                     id              TEXT PRIMARY KEY CHECK (length(id) = 36),
                                     student_id      TEXT NOT NULL,
                                     mentor_id       TEXT NOT NULL,
                                     title           TEXT NOT NULL,
                                     description     TEXT,
                                     duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12, 24, 48)),
                                     start_date      TEXT NOT NULL,
                                     end_date        TEXT NOT NULL,
                                     status          TEXT NOT NULL DEFAULT 'ACTIVE'
                                         CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
                                     created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                     updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                     CHECK (end_date > start_date)
);

CREATE INDEX idx_programs_student ON mentorship_programs (student_id, status);
CREATE INDEX idx_programs_mentor  ON mentorship_programs (mentor_id, status);

CREATE TABLE goals (
                       id                  TEXT PRIMARY KEY CHECK (length(id) = 36),
                       program_id          TEXT NOT NULL REFERENCES mentorship_programs (id) ON DELETE CASCADE,
                       title               TEXT NOT NULL,
                       description         TEXT,
                       target_date         TEXT,
                       status              TEXT NOT NULL DEFAULT 'NOT_STARTED'
                           CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
                       progress_percentage INTEGER NOT NULL DEFAULT 0
                           CHECK (progress_percentage BETWEEN 0 AND 100),
                       created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                       updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_goals_program ON goals (program_id);

CREATE TABLE tasks (
                       id          TEXT PRIMARY KEY CHECK (length(id) = 36),
                       program_id  TEXT NOT NULL REFERENCES mentorship_programs (id) ON DELETE CASCADE,
                       goal_id     TEXT REFERENCES goals (id) ON DELETE SET NULL,
                       assigned_by TEXT NOT NULL,
                       assigned_to TEXT NOT NULL,
                       title       TEXT NOT NULL,
                       description TEXT,
                       due_date    TEXT,
                       priority    TEXT NOT NULL DEFAULT 'MEDIUM'
                           CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
                       status      TEXT NOT NULL DEFAULT 'TODO'
                           CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
                       created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                       updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_tasks_program  ON tasks (program_id, status);
CREATE INDEX idx_tasks_goal     ON tasks (goal_id);
CREATE INDEX idx_tasks_assignee ON tasks (assigned_to, status, due_date);

CREATE TABLE progress_updates (
                                  id          TEXT PRIMARY KEY CHECK (length(id) = 36),
                                  goal_id     TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
                                  student_id  TEXT NOT NULL,
                                  percentage  INTEGER NOT NULL CHECK (percentage BETWEEN 0 AND 100),
                                  description TEXT,
                                  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_progress_goal ON progress_updates (goal_id, created_at DESC);

-- PRIVATE notes are hidden from the student
CREATE TABLE mentor_notes (
                              id         TEXT PRIMARY KEY CHECK (length(id) = 36),
                              program_id TEXT REFERENCES mentorship_programs (id) ON DELETE CASCADE,
                              mentor_id  TEXT NOT NULL,
                              student_id TEXT NOT NULL,
                              session_id TEXT,
                              content    TEXT NOT NULL,
                              visibility TEXT NOT NULL DEFAULT 'PRIVATE'
                                  CHECK (visibility IN ('PRIVATE', 'SHARED')),
                              created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notes_student ON mentor_notes (student_id, visibility);
CREATE INDEX idx_notes_program ON mentor_notes (program_id);

-- ===== analytic =====

-- user, booking and mentor ids point to other services (no FK)
CREATE TABLE audit_logs (
                            id           TEXT PRIMARY KEY CHECK (length(id) = 36),
                            user_id      TEXT,
                            service_name TEXT NOT NULL,
                            action       TEXT NOT NULL,
                            entity_type  TEXT NOT NULL,
                            entity_id    TEXT,
                            metadata     TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
                            created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_user   ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs (service_name, action, created_at DESC);

-- audit rows are append-only
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TABLE reports (
                         id                TEXT PRIMARY KEY CHECK (length(id) = 36),
                         reported_by       TEXT NOT NULL,
                         reported_user_id  TEXT,
                         booking_id        TEXT,
                         category          TEXT NOT NULL,
                         description       TEXT NOT NULL,
                         status            TEXT NOT NULL DEFAULT 'OPEN'
                             CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')),
                         assigned_admin_id TEXT,
                         resolution        TEXT,
                         created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                         updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                         resolved_at       TEXT
);

CREATE INDEX idx_reports_status   ON reports (status, created_at DESC);
CREATE INDEX idx_reports_reported ON reports (reported_user_id);

CREATE TABLE recommendations (
                                 id           TEXT PRIMARY KEY CHECK (length(id) = 36),
                                 student_id   TEXT NOT NULL,
                                 mentor_id    TEXT NOT NULL,
                                 score        REAL NOT NULL CHECK (score >= 0),
                                 reason       TEXT,
                                 generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                                 UNIQUE (student_id, mentor_id)
);

CREATE INDEX idx_recommendations_student ON recommendations (student_id, score DESC);

-- one row per day, filled by DailyAnalyticsAggregationScheduler
CREATE TABLE daily_stats (
                             stat_date          TEXT PRIMARY KEY,
                             new_users          INTEGER NOT NULL DEFAULT 0,
                             total_bookings     INTEGER NOT NULL DEFAULT 0,
                             completed_bookings INTEGER NOT NULL DEFAULT 0,
                             cancelled_bookings INTEGER NOT NULL DEFAULT 0,
                             revenue_cents      INTEGER NOT NULL DEFAULT 0,
                             active_mentors     INTEGER NOT NULL DEFAULT 0,
                             created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
