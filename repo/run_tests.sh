#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Generate ephemeral test secrets — never committed, only live in this shell.
export AUTH_TOKEN_SECRET="$(openssl rand -hex 32)"
export REFRESH_TOKEN_SECRET="$(openssl rand -hex 32)"
export REQUEST_SIGNING_SECRET="$(openssl rand -hex 32)"
export DATA_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export SEED_ADMIN_PASSWORD="TestAdmin$(openssl rand -hex 4)Rotate1"
export SEED_CLINICIAN_PASSWORD="TestClin$(openssl rand -hex 4)Rotate1"
export SEED_CLIENT_PASSWORD="TestClient$(openssl rand -hex 4)Rotate1"
export COOKIE_SECURE="false"

echo "[tests] Starting stack for test execution..."
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --build mongodb mongo-rs-init mongo-seed backend frontend test-runner e2e-runner

echo "[tests] Running backend unit tests..."
docker compose exec -T test-runner sh -lc "cd /workspace/apps/backend && npm ci --omit=dev >/dev/null && cd /workspace && MONGO_URI='mongodb://127.0.0.1:27017/offline_system?replicaSet=rs0' MONGO_DB_NAME='offline_system' AUTH_TOKEN_SECRET='${AUTH_TOKEN_SECRET}' REFRESH_TOKEN_SECRET='${REFRESH_TOKEN_SECRET}' REQUEST_SIGNING_SECRET='${REQUEST_SIGNING_SECRET}' DATA_ENCRYPTION_KEY='${DATA_ENCRYPTION_KEY}' node --test unit_tests/backend"

echo "[tests] Running frontend unit tests..."
docker compose exec -T test-runner sh -lc "cd /workspace && node --test unit_tests/frontend"

echo "[tests] Running API integration tests..."
docker compose exec -T test-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 SEED_ADMIN_PASSWORD='${SEED_ADMIN_PASSWORD}' SEED_CLINICIAN_PASSWORD='${SEED_CLINICIAN_PASSWORD}' SEED_CLIENT_PASSWORD='${SEED_CLIENT_PASSWORD}' node --test API_tests"

echo "[tests] Running lightweight E2E tests..."
docker compose exec -T e2e-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 FRONTEND_BASE_URL=http://127.0.0.1:3000 SEED_ADMIN_PASSWORD='${SEED_ADMIN_PASSWORD}' SEED_CLINICIAN_PASSWORD='${SEED_CLINICIAN_PASSWORD}' SEED_CLIENT_PASSWORD='${SEED_CLIENT_PASSWORD}' node --test e2e/tests"

echo "[tests] All test suites passed."
