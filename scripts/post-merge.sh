#!/bin/bash
set -e
npm install
# NOTE: db:push is intentionally NOT run here. This project uses raw SQL
# migrations applied manually (see MIGRATION_NOTES.md). Drizzle is used
# only as a query builder — `npm run db:push` is hard-blocked in
# package.json. Any new schema must be applied via the SQL files in
# migrations/manual/ before/after the merge as needed.
