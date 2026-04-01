#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[tests] Starting stack for test execution..."
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --build mongodb mongo-rs-init mongo-seed backend frontend test-runner e2e-runner

echo "[tests] Running backend unit tests..."
docker compose exec -T test-runner sh -lc "cd /workspace/apps/backend && npm ci --omit=dev >/dev/null && cd /workspace && MONGO_URI='mongodb://127.0.0.1:27017/offline_system?replicaSet=rs0' MONGO_DB_NAME='offline_system' AUTH_TOKEN_SECRET='8m3Yb9Q2r7Lp4Vs1Xc6Ke0Na5Ht8Ju3Wd4Rf1Zp6Cx2Q' REFRESH_TOKEN_SECRET='4Tr8Vy1Nq6Ws9Pd3Lk2Jh7Zx5Cb0Mf8Rg1Sn4Tx9Ua6E' REQUEST_SIGNING_SECRET='7Pk4Wm9Lc2Qs8Hv1Nx5Je3Rt6Yb0Df4Ua9Ko2Mz7Xp5S' DATA_ENCRYPTION_KEY='C5r8Nv2Qk7Yp4Lm9Ht1Ws6Dx3Jf0Bc5Ze8Ua2Po7Rt4L' node --test unit_tests/backend"

echo "[tests] Running frontend unit tests..."
docker compose exec -T test-runner sh -lc "cd /workspace && node --test unit_tests/frontend"

echo "[tests] Running API integration tests..."
docker compose exec -T test-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 node --test API_tests"

echo "[tests] Running lightweight E2E tests..."
docker compose exec -T e2e-runner sh -lc "cd /workspace && BACKEND_BASE_URL=http://127.0.0.1:4000 FRONTEND_BASE_URL=http://127.0.0.1:3000 node --test e2e/tests"

echo "[tests] All test suites passed."
