-- MentorConnect Edge API schema, merged from docs/database/schema (user, mentor, booking, notification)
-- ids from other source services stay logical (no FK), as in the source schemas

-- user
CREATE TABLE users (
    id                TEXT PRIMARY KEY CHECK (length(id) = 36),
    external_auth_id  TEXT NOT NULL UNIQUE,
    email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash     TEXT NOT NULL,
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    phone             TEXT,
    profile_image_key TEXT,
    role              TEXT NOT NULL
        CHECK (role IN ('STUDENT', 'MENTOR', 'ADMIN')),
    account_status    TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_status ON users (account_status);

-- one profile per STUDENT user
CREATE TABLE student_profiles (
    id            TEXT PRIMARY KEY CHECK (length(id) = 36),
    user_id       TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    university    TEXT,
    faculty       TEXT,
    degree        TEXT,
    academic_year INTEGER CHECK (academic_year BETWEEN 1 AND 10),
    bio           TEXT,
    interests     TEXT,
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- mentor (user_id is logical)
CREATE TABLE mentors (
    id                  TEXT PRIMARY KEY CHECK (length(id) = 36),
    user_id             TEXT NOT NULL UNIQUE,
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

-- start_time and end_time are UTC ISO-8601, version is an optimistic lock
CREATE TABLE availability_slots (
    id         TEXT PRIMARY KEY CHECK (length(id) = 36),
    mentor_id  TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
    start_time TEXT NOT NULL,
    end_time   TEXT NOT NULL,
    timezone   TEXT NOT NULL DEFAULT 'UTC',
    status     TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED')),
    version    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (end_time > start_time),
    UNIQUE (mentor_id, start_time)
);

CREATE INDEX idx_slots_mentor_status_start ON availability_slots (mentor_id, status, start_time);
CREATE INDEX idx_slots_status_start        ON availability_slots (status, start_time);

-- document_key is an R2 object key, reviewed_by is a logical admin user id
CREATE TABLE mentor_verifications (
    id           TEXT PRIMARY KEY CHECK (length(id) = 36),
    mentor_id    TEXT NOT NULL REFERENCES mentors (id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by  TEXT,
    review_note  TEXT,
    submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    reviewed_at  TEXT
);

CREATE INDEX idx_verifications_mentor ON mentor_verifications (mentor_id);
CREATE INDEX idx_verifications_status ON mentor_verifications (status);

-- booking (student_id, mentor_id, slot_id are logical)
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

-- notification (user_id, sender_id are logical)
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
