#!/usr/bin/env bash
# Encrypted logical backup of the hosted database (used by backup.yml and before every deploy).
# Needs: SUPABASE_DB_URL (session pooler connection string), BACKUP_PASSPHRASE, Docker (supabase db dump runs pg_dump
# in a container matching the server version). Output: backups/<name>.tar.gz.gpg
# Uploaded documents (spec 004) go in files/, via the Storage S3 keys SUPABASE_S3_* (see scripts/backup-files.mjs).
#
# Restore (see docs/go-live.md): gpg --decrypt <file>.tar.gz.gpg | tar xz, then psql roles.sql, schema.sql, data.sql,
# then node scripts/restore-files.mjs <folder>.
set -euo pipefail
name="${1:-backup-$(date -u +%Y%m%d-%H%M%S)}"
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p backups "$work/$name"

npx supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/$name/roles.sql" --role-only
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/$name/schema.sql"
# Storage analytics/vector/iceberg tables are version-specific internals (unused here) and cannot be restored
# by the postgres role, so they are left out; buckets and objects are kept.
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/$name/data.sql" --use-copy --data-only \
  -x storage.buckets_analytics,storage.buckets_vectors,storage.vector_indexes,storage.iceberg_namespaces,storage.iceberg_tables

# Documents' files. Fails if documents exist but the files can't be copied.
node scripts/backup-files.mjs "$work/$name"

# A dump that silently came out empty is worse than a failed job.
for f in roles schema data; do
  test -s "$work/$name/$f.sql" || { echo "::error::$f.sql is empty"; exit 1; }
done

tar -C "$work" -czf "$work/$name.tar.gz" "$name"
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
  --symmetric --cipher-algo AES256 -o "backups/$name.tar.gz.gpg" "$work/$name.tar.gz"
ls -lh "backups/$name.tar.gz.gpg"
