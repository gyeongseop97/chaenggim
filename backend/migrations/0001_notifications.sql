-- Device capability tokens are hashed. Location/schedules exist only after notification opt-in.
CREATE TABLE IF NOT EXISTS weather_notification_devices (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  location_json TEXT NOT NULL,
  schedules_json TEXT NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('cold','normal','hot')),
  time_zone TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL DEFAULT 30 CHECK (lead_minutes = 30),
  daily_notification_time TEXT NOT NULL DEFAULT '07:00',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER,
  last_test_at INTEGER,
  test_retry_at INTEGER
);
CREATE INDEX IF NOT EXISTS weather_notification_check_order ON weather_notification_devices(last_checked_at,device_id);
CREATE TABLE IF NOT EXISTS weather_notification_deliveries (
  delivery_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES weather_notification_devices(device_id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','pending','sent','retry','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  last_error TEXT,
  UNIQUE(device_id,occurrence_key)
);
CREATE INDEX IF NOT EXISTS weather_notification_delivery_cleanup ON weather_notification_deliveries(created_at);
