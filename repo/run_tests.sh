#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# All cryptographic secret generation runs inside a throwaway Docker
# container — Docker is the ONLY host prerequisite for this script.
# No host-side Node.js, openssl, or any other crypto tool is required.
# The node:20-alpine container executes the CSPRNG logic and prints ready-
# to-eval shell export statements; eval injects them into the current shell
# environment.  Nothing is ever written to disk or a .env file.
# Docker Compose reads the variables from the environment via the ${VAR:-}
# substitutions in docker-compose.yml; a static .env file is not required
# and, if present, is explicitly bypassed by --env-file /dev/null below.
# ---------------------------------------------------------------------------
eval "$(docker run --rm node:20-alpine node -e \
  'const c=require("crypto"),h=n=>c.randomBytes(n).toString("hex");console.log(["export AUTH_TOKEN_SECRET="+h(32),"export REFRESH_TOKEN_SECRET="+h(32),"export REQUEST_SIGNING_SECRET="+h(32),"export DATA_ENCRYPTION_KEY="+h(32),"export SEED_ADMIN_PASSWORD=TestAdmin"+h(4)+"Rotate1","export SEED_CLINICIAN_PASSWORD=TestClin"+h(4)+"Rotate1","export SEED_CLIENT_PASSWORD=TestClient"+h(4)+"Rotate1"].join("\n"))'
)"

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

echo "[tests] Running E2E tests (browser + HTTP)..."
dc exec -T e2e-runner sh -lc "mkdir -p /workspace/e2e/node_modules && ln -sfn /usr/lib/node_modules/@playwright /workspace/e2e/node_modules/@playwright && cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 FRONTEND_BASE_URL=http://127.0.0.1:3000 SEED_ADMIN_PASSWORD='${SEED_ADMIN_PASSWORD}' SEED_CLINICIAN_PASSWORD='${SEED_CLINICIAN_PASSWORD}' SEED_CLIENT_PASSWORD='${SEED_CLIENT_PASSWORD}' node --test e2e/tests"

echo "[tests] All test suites passed."
