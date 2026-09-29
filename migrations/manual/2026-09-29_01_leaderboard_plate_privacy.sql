-- Customer leaderboard plate disclosure is opt-in, including existing users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_full_plate_on_leaderboard BOOLEAN NOT NULL DEFAULT FALSE;