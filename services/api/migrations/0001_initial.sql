-- D1 enforces foreign-key constraints by default for queries and migrations.\n\nCREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  access_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  platform_role TEXT NOT NULL DEFAULT 'none'
    CHECK (platform_role IN ('none', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE space_settings (
  space_id TEXT PRIMARY KEY,
  cancellation_cutoff_minutes INTEGER
    CHECK (
      cancellation_cutoff_minutes IS NULL OR
      cancellation_cutoff_minutes IN (15, 30, 60, 240, 1440)
    ),
  booking_cutoff_minutes INTEGER
    CHECK (
      booking_cutoff_minutes IS NULL OR
      booking_cutoff_minutes IN (15, 30, 60, 240, 1440)
    ),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  wechat_openid TEXT NOT NULL UNIQUE,
  wechat_unionid TEXT UNIQUE,
  nickname TEXT NOT NULL,
  avatar_object_key TEXT,
  last_space_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (last_space_id) REFERENCES spaces(id) ON DELETE SET NULL
);

CREATE TABLE space_admins (
  space_id TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, admin_user_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE TABLE invite_codes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  created_by_admin_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE (id, space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE TABLE space_memberships (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  invited_by_admin_id TEXT NOT NULL,
  invite_code_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  admin_note TEXT,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (space_id, user_id),
  UNIQUE (id, space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (invited_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (invite_code_id, space_id)
    REFERENCES invite_codes(id, space_id) ON DELETE RESTRICT
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_month TEXT NOT NULL
    CHECK (
      birth_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND
      CAST(substr(birth_month, 6, 2) AS INTEGER) BETWEEN 1 AND 12
    ),
  user_note TEXT,
  admin_note TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, membership_id, space_id),
  FOREIGN KEY (membership_id, space_id)
    REFERENCES space_memberships(id, space_id) ON DELETE RESTRICT
);

CREATE TABLE slot_types (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (space_id, name),
  UNIQUE (id, space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE slot_series (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  slot_type_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  local_start_time TEXT NOT NULL,
  local_end_time TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'cancelled')),
  supersedes_series_id TEXT,
  created_by_admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (resource_id, space_id)
    REFERENCES resources(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (slot_type_id, space_id)
    REFERENCES slot_types(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_series_id, space_id)
    REFERENCES slot_series(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id)
    REFERENCES admin_users(id) ON DELETE RESTRICT,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE slot_series_weekdays (
  series_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  PRIMARY KEY (series_id, weekday),
  FOREIGN KEY (series_id) REFERENCES slot_series(id) ON DELETE CASCADE
);

CREATE TABLE slots (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  slot_type_id TEXT NOT NULL,
  series_id TEXT,
  series_occurrence_date TEXT,
  is_series_exception INTEGER NOT NULL DEFAULT 0
    CHECK (is_series_exception IN (0, 1)),
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'frozen', 'cancelled')),
  created_by_admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (resource_id, space_id)
    REFERENCES resources(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (slot_type_id, space_id)
    REFERENCES slot_types(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (series_id, space_id)
    REFERENCES slot_series(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id)
    REFERENCES admin_users(id) ON DELETE RESTRICT,
  CHECK (end_at > start_at),
  CHECK (
    (series_id IS NULL AND series_occurrence_date IS NULL) OR
    (series_id IS NOT NULL AND series_occurrence_date IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_slots_series_occurrence
  ON slots(series_id, series_occurrence_date)
  WHERE series_id IS NOT NULL;

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'cancelled', 'completed')),
  cancelled_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (slot_id, space_id)
    REFERENCES slots(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (membership_id, space_id)
    REFERENCES space_memberships(id, space_id) ON DELETE RESTRICT,
  FOREIGN KEY (participant_id, membership_id, space_id)
    REFERENCES participants(id, membership_id, space_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_bookings_slot_occupancy
  ON bookings(slot_id)
  WHERE status IN ('booked', 'completed');

CREATE TABLE booking_messages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('user', 'admin')),
  sender_user_id TEXT,
  sender_admin_id TEXT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (booking_id, space_id)
    REFERENCES bookings(id, space_id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id)
    REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (sender_admin_id)
    REFERENCES admin_users(id) ON DELETE RESTRICT,
  CHECK (
    (sender_kind = 'user' AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL) OR
    (sender_kind = 'admin' AND sender_admin_id IS NOT NULL AND sender_user_id IS NULL)
  )
);

CREATE TABLE booking_history (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL
    CHECK (actor_kind IN ('user', 'admin', 'system')),
  actor_user_id TEXT,
  actor_admin_id TEXT,
  action TEXT NOT NULL
    CHECK (action IN ('created', 'updated', 'cancelled', 'completed')),
  before_json TEXT,
  after_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (booking_id, space_id)
    REFERENCES bookings(id, space_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id)
    REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_admin_id)
    REFERENCES admin_users(id) ON DELETE RESTRICT,
  CHECK (
    (actor_kind = 'user' AND actor_user_id IS NOT NULL AND actor_admin_id IS NULL) OR
    (actor_kind = 'admin' AND actor_admin_id IS NOT NULL AND actor_user_id IS NULL) OR
    (actor_kind = 'system' AND actor_user_id IS NULL AND actor_admin_id IS NULL)
  )
);

CREATE INDEX idx_memberships_space_status
  ON space_memberships(space_id, status);
CREATE INDEX idx_memberships_invited_by
  ON space_memberships(space_id, invited_by_admin_id);
CREATE INDEX idx_participants_membership_status
  ON participants(membership_id, status);
CREATE INDEX idx_resources_space_status
  ON resources(space_id, status);
CREATE INDEX idx_slot_types_space_status
  ON slot_types(space_id, status);
CREATE INDEX idx_slot_series_resource_status
  ON slot_series(resource_id, status);
CREATE INDEX idx_slots_resource_start
  ON slots(resource_id, start_at);
CREATE INDEX idx_slots_space_start
  ON slots(space_id, start_at);
CREATE INDEX idx_slots_space_status_start
  ON slots(space_id, status, start_at);
CREATE INDEX idx_bookings_membership_created
  ON bookings(membership_id, created_at DESC);
CREATE INDEX idx_bookings_participant_created
  ON bookings(participant_id, created_at DESC);
CREATE INDEX idx_bookings_space_status
  ON bookings(space_id, status);
CREATE INDEX idx_booking_messages_booking_created
  ON booking_messages(booking_id, created_at);
CREATE INDEX idx_booking_history_booking_created
  ON booking_history(booking_id, created_at);

CREATE TRIGGER trg_slots_no_overlap_insert
BEFORE INSERT ON slots
WHEN NEW.status IN ('open', 'frozen')
  AND EXISTS (
    SELECT 1
    FROM slots AS existing
    WHERE existing.resource_id = NEW.resource_id
      AND existing.status IN ('open', 'frozen')
      AND existing.start_at < NEW.end_at
      AND existing.end_at > NEW.start_at
  )
BEGIN
  SELECT RAISE(ABORT, 'SLOT_OVERLAP');
END;

CREATE TRIGGER trg_slots_no_overlap_update
BEFORE UPDATE OF resource_id, start_at, end_at, status ON slots
WHEN NEW.status IN ('open', 'frozen')
  AND EXISTS (
    SELECT 1
    FROM slots AS existing
    WHERE existing.resource_id = NEW.resource_id
      AND existing.id <> NEW.id
      AND existing.status IN ('open', 'frozen')
      AND existing.start_at < NEW.end_at
      AND existing.end_at > NEW.start_at
  )
BEGIN
  SELECT RAISE(ABORT, 'SLOT_OVERLAP');
END;

CREATE TRIGGER trg_slots_prevent_cancel_with_active_booking
BEFORE UPDATE OF status ON slots
WHEN NEW.status = 'cancelled'
  AND EXISTS (
    SELECT 1
    FROM bookings
    WHERE bookings.slot_id = NEW.id
      AND bookings.status IN ('booked', 'completed')
  )
BEGIN
  SELECT RAISE(ABORT, 'SLOT_HAS_ACTIVE_BOOKING');
END;

CREATE TRIGGER trg_bookings_require_open_slot_insert
BEFORE INSERT ON bookings
WHEN NEW.status = 'booked'
  AND NOT EXISTS (
    SELECT 1
    FROM slots
    WHERE slots.id = NEW.slot_id
      AND slots.space_id = NEW.space_id
      AND slots.status = 'open'
  )
BEGIN
  SELECT RAISE(ABORT, 'SLOT_NOT_BOOKABLE');
END;

CREATE TRIGGER trg_bookings_require_open_slot_update
BEFORE UPDATE OF slot_id, space_id, status ON bookings
WHEN NEW.status = 'booked'
  AND NOT EXISTS (
    SELECT 1
    FROM slots
    WHERE slots.id = NEW.slot_id
      AND slots.space_id = NEW.space_id
      AND slots.status = 'open'
  )
BEGIN
  SELECT RAISE(ABORT, 'SLOT_NOT_BOOKABLE');
END;
