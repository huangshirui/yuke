-- Booking fulfillment provenance and reconciliation state.
-- Completion remains part of Booking lifecycle; reconciliation is a separate one-to-one business process.

ALTER TABLE bookings ADD COLUMN completion_source TEXT
  CHECK (
    completion_source IS NULL OR
    completion_source IN ('manual', 'classin_import', 'external_import', 'external_api')
  );

ALTER TABLE bookings ADD COLUMN completion_external_reference TEXT;
ALTER TABLE bookings ADD COLUMN completion_batch_id TEXT;

CREATE TABLE booking_reconciliations (
  booking_id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settled')),
  settlement_source TEXT
    CHECK (
      settlement_source IS NULL OR
      settlement_source IN ('manual', 'import', 'external_api')
    ),
  settled_at INTEGER,
  settled_by_admin_id TEXT,
  batch_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (booking_id, space_id),
  FOREIGN KEY (booking_id, space_id)
    REFERENCES bookings(id, space_id) ON DELETE CASCADE,
  FOREIGN KEY (settled_by_admin_id)
    REFERENCES admin_users(id) ON DELETE RESTRICT,
  CHECK (
    (
      status = 'pending' AND
      settlement_source IS NULL AND
      settled_at IS NULL AND
      settled_by_admin_id IS NULL
    ) OR
    (
      status = 'settled' AND
      settlement_source IS NOT NULL AND
      settled_at IS NOT NULL AND
      (settlement_source <> 'manual' OR settled_by_admin_id IS NOT NULL)
    )
  )
);

CREATE INDEX idx_booking_reconciliations_space_status
  ON booking_reconciliations(space_id, status);

-- Existing completed Bookings become explicitly pending reconciliation.
INSERT INTO booking_reconciliations (
  booking_id,
  space_id,
  status,
  settlement_source,
  settled_at,
  settled_by_admin_id,
  batch_id,
  note,
  created_at,
  updated_at
)
SELECT id,
       space_id,
       'pending',
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       COALESCE(completed_at, updated_at),
       updated_at
FROM bookings
WHERE status = 'completed'
ON CONFLICT(booking_id) DO NOTHING;
