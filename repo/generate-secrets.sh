#!/usr/bin/env bash
set -euo pipefail

# Generates a fresh .env file with cryptographically random secrets.
# Run once per install before the first `docker compose up --build`.
# Does NOT require external services — uses only /dev/urandom via openssl.

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"

if [ -f "$ENV_FILE" ]; then
  echo "[generate-secrets] .env already exists at $ENV_FILE"
  echo "[generate-secrets] To regenerate, delete the existing file first."
  exit 0
fi

gen() { openssl rand -hex 32; }

cat > "$ENV_FILE" <<EOF
# Auto-generated secrets — do NOT commit this file to version control.
AUTH_TOKEN_SECRET=$(gen)
REFRESH_TOKEN_SECRET=$(gen)
REQUEST_SIGNING_SECRET=$(gen)
DATA_ENCRYPTION_KEY=$(gen)

# Seed passwords — users MUST change these on first login.
SEED_ADMIN_PASSWORD=Admin$(openssl rand -hex 8)Rotate1
SEED_CLINICIAN_PASSWORD=Clin$(openssl rand -hex 8)Rotate1
SEED_CLIENT_PASSWORD=Client$(openssl rand -hex 8)Rotate1
EOF

echo "[generate-secrets] Created $ENV_FILE with fresh secrets."
echo "[generate-secrets] IMPORTANT: All seeded passwords require rotation on first login."
