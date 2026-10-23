export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  login_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roles TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  species TEXT NOT NULL CHECK (species IN ('cat', 'dog')),
  weight REAL NOT NULL CHECK (weight > 0),
  contact TEXT NOT NULL,
  care_notes TEXT NOT NULL DEFAULT '',
  vaccine_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

CREATE TABLE IF NOT EXISTS room_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  species TEXT NOT NULL CHECK (species IN ('cat', 'dog')),
  daily_price_fen INTEGER NOT NULL CHECK (daily_price_fen >= 0)
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  name TEXT NOT NULL UNIQUE,
  max_weight REAL NOT NULL CHECK (max_weight > 0)
);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type_id);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES accounts(id),
  pet_id INTEGER NOT NULL REFERENCES pets(id),
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  room_id INTEGER REFERENCES rooms(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  daily_price_snapshot_fen INTEGER NOT NULL CHECK (daily_price_snapshot_fen >= 0),
  planned_days INTEGER NOT NULL CHECK (planned_days >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'missed', 'completed')),
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_by INTEGER REFERENCES accounts(id),
  reviewed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_owner ON reservations(owner_id);
CREATE INDEX IF NOT EXISTS idx_reservations_pet ON reservations(pet_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id);

CREATE TABLE IF NOT EXISTS stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id),
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  inspection_notes TEXT NOT NULL DEFAULT '',
  late_reason TEXT,
  check_in_staff_id INTEGER NOT NULL REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_stays_checkout ON stays(check_out_at);

CREATE TABLE IF NOT EXISTS care_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id INTEGER NOT NULL REFERENCES stays(id),
  kind TEXT NOT NULL CHECK (kind IN ('feeding', 'water', 'cleaning', 'other')),
  planned_at TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_care_tasks_stay ON care_tasks(stay_id);

CREATE TABLE IF NOT EXISTS care_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE REFERENCES care_tasks(id),
  staff_id INTEGER NOT NULL REFERENCES accounts(id),
  completed_at TEXT NOT NULL,
  notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id INTEGER NOT NULL UNIQUE REFERENCES stays(id),
  planned_days INTEGER NOT NULL,
  daily_price_snapshot_fen INTEGER NOT NULL,
  base_fee_fen INTEGER NOT NULL,
  overdue_days INTEGER NOT NULL,
  overdue_fee_fen INTEGER NOT NULL,
  total_fen INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid')),
  computed_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id),
  amount_fen INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  staff_id INTEGER NOT NULL REFERENCES accounts(id),
  paid_at TEXT NOT NULL
);
`
