#!/usr/bin/env bash
set -euo pipefail

# Generates a fresh .env file with cryptographically random secrets.
# Runs entirely within Docker — no host-side openssl or crypto dependency.
# Run once per install before the first `docker-compose up --build`.

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"

if [ -f "$ENV_FILE" ]; then
  echo "[generate-secrets] .env already exists at $ENV_FILE"
  echo "[generate-secrets] To regenerate, delete the existing file first."
  exit 0
fi

echo "[generate-secrets] Generating secrets via Docker (no host openssl required)..."

# All secret generation is delegated to a throwaway node:20-alpine container.
# The Node.js script writes the complete .env content to stdout, which is
# redirected to the .env file on the host.  No host-side openssl, /dev/urandom
# access, or any other crypto primitive is used outside the container.
docker run --rm node:20-alpine node - > "$ENV_FILE" <<'NODESCRIPT'
const crypto = require('crypto');
const hex32 = () => crypto.randomBytes(32).toString('hex');
const hex8  = () => crypto.randomBytes(8).toString('hex');

process.stdout.write(
  '# Auto-generated secrets — do NOT commit this file to version control.\n' +
  'AUTH_TOKEN_SECRET='        + hex32() + '\n' +
  'REFRESH_TOKEN_SECRET='     + hex32() + '\n' +
  'REQUEST_SIGNING_SECRET='   + hex32() + '\n' +
  'DATA_ENCRYPTION_KEY='      + hex32() + '\n' +
  '\n' +
  '# Seed passwords — users MUST change these on first login.\n' +
  'SEED_ADMIN_PASSWORD=Admin'     + hex8() + 'Rotate1\n' +
  'SEED_CLINICIAN_PASSWORD=Clin'  + hex8() + 'Rotate1\n' +
  'SEED_CLIENT_PASSWORD=Client'   + hex8() + 'Rotate1\n'
);
NODESCRIPT

echo "[generate-secrets] Created $ENV_FILE with fresh secrets."
echo "[generate-secrets] IMPORTANT: All seeded passwords require rotation on first login."
