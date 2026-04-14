#!/bin/sh
set -eu

# Dynamically generate any missing cryptographic secrets at container startup.
# This avoids requiring a static .env file or external secret management while
# ensuring the application never starts with blank/weak secrets.
#
# Secrets are persisted to a shared volume so that all containers (seed,
# backend) within the same compose stack use identical keys. The first
# container to start generates the secrets; subsequent containers read them.
#
# Each secret is a 64-character hex string (32 random bytes) produced by
# Node.js's crypto module, which sources from the kernel CSPRNG.

SECRETS_DIR="${RUNTIME_SECRETS_DIR:-/var/lib/offline-system/.secrets}"
SECRETS_FILE="${SECRETS_DIR}/runtime-secrets.env"

generate_secret() {
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
}

ensure_secret() {
  local var_name="$1"
  eval "local current_val=\"\${${var_name}:-}\""
  if [ -n "$current_val" ]; then
    return
  fi
  local new_val
  new_val="$(generate_secret)"
  export "${var_name}=${new_val}"
  echo "${var_name}=${new_val}" >> "$SECRETS_FILE"
  echo "[entrypoint] Generated ${var_name} dynamically"
}

# Load previously generated secrets from the shared volume, if available.
if [ -f "$SECRETS_FILE" ]; then
  echo "[entrypoint] Loading runtime secrets from ${SECRETS_FILE}"
  set -a
  . "$SECRETS_FILE"
  set +a
fi

# Generate any secrets that are still missing (first container in the stack).
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

ensure_secret AUTH_TOKEN_SECRET
ensure_secret REFRESH_TOKEN_SECRET
ensure_secret REQUEST_SIGNING_SECRET
ensure_secret DATA_ENCRYPTION_KEY

# Lock down the secrets file.
if [ -f "$SECRETS_FILE" ]; then
  chmod 600 "$SECRETS_FILE"
fi

exec "$@"
