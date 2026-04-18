#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Generate per-run cryptographic secrets entirely inside a throwaway Docker
# container — Docker is the ONLY host prerequisite for this script.
# No host-side Node.js, openssl, or other crypto tools are required.
# Variables are exported into the current shell environment only; they are
# never written to a .env file or any other persistent location.
# Docker Compose reads them from the shell environment via the ${VAR:-}
# substitutions in docker-compose.yml; a static .env file is not required
# and, if present, is explicitly bypassed by the --env-file /dev/null flag
# passed to every docker compose invocation below.
# ---------------------------------------------------------------------------
_SECRET_OUTPUT="$(docker run --rm -i node:20-alpine node -e \
  'const c=require("crypto"),h=n=>c.randomBytes(n).toString("hex");process.stdout.write(["AUTH_TOKEN_SECRET="+h(32),"REFRESH_TOKEN_SECRET="+h(32),"REQUEST_SIGNING_SECRET="+h(32),"DATA_ENCRYPTION_KEY="+h(32),"SEED_ADMIN_PASSWORD=TestAdmin"+h(4)+"Rotate1","SEED_CLINICIAN_PASSWORD=TestClin"+h(4)+"Rotate1","SEED_CLIENT_PASSWORD=TestClient"+h(4)+"Rotate1"].join("\n"));'
)"
while IFS='=' read -r _k _v || [[ -n "$_k" ]]; do
  [[ -n "$_k" ]] && export "$_k=$_v"
done <<< "$_SECRET_OUTPUT"
unset _SECRET_OUTPUT _k _v

export COOKIE_SECURE="false"
# Allow seeded users to log in directly during the test stack run. Production
# stacks must NEVER set this. The mustRotatePassword enforcement code path is
# still exercised by the targeted unit/integration tests for that feature.
export SEED_REQUIRE_ROTATION="false"

# dc() wraps docker compose with --env-file /dev/null to ensure no static
# .env file on disk is loaded; all configuration comes exclusively from the
# dynamically generated shell exports above.
dc() { docker compose --env-file /dev/null "$@"; }

echo "[tests] Starting stack for test execution..."
dc down -v --remove-orphans >/dev/null 2>&1 || true
dc up -d --build mongodb mongo-rs-init mongo-seed backend frontend test-runner e2e-runner

echo "[tests] Running backend unit tests..."
dc exec -T test-runner sh -lc "cd /workspace/apps/backend && npm ci --omit=dev >/dev/null && cd /workspace && MONGO_URI='mongodb://127.0.0.1:27017/offline_system?replicaSet=rs0' MONGO_DB_NAME='offline_system' AUTH_TOKEN_SECRET='${AUTH_TOKEN_SECRET}' REFRESH_TOKEN_SECRET='${REFRESH_TOKEN_SECRET}' REQUEST_SIGNING_SECRET='${REQUEST_SIGNING_SECRET}' DATA_ENCRYPTION_KEY='${DATA_ENCRYPTION_KEY}' node --test unit_tests/backend"

echo "[tests] Running frontend unit tests..."
dc exec -T test-runner sh -lc "cd /workspace && node --test unit_tests/frontend"

echo "[tests] Running frontend component DOM tests (Vitest + React Testing Library)..."
dc exec -T test-runner sh -lc "cd /workspace/apps/frontend && npm ci --silent && npx vitest run"

echo "[tests] Running API integration tests..."
dc exec -T test-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 SEED_ADMIN_PASSWORD='${SEED_ADMIN_PASSWORD}' SEED_CLINICIAN_PASSWORD='${SEED_CLINICIAN_PASSWORD}' SEED_CLIENT_PASSWORD='${SEED_CLIENT_PASSWORD}' node --test API_tests"

echo "[tests] Running lightweight E2E tests..."
dc exec -T e2e-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 FRONTEND_BASE_URL=http://127.0.0.1:3000 SEED_ADMIN_PASSWORD='${SEED_ADMIN_PASSWORD}' SEED_CLINICIAN_PASSWORD='${SEED_CLINICIAN_PASSWORD}' SEED_CLIENT_PASSWORD='${SEED_CLIENT_PASSWORD}' node --test e2e/tests"

echo "[tests] All test suites passed."
