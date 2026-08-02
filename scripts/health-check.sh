#!/bin/sh
set -eu
BASE_URL="${APP_PUBLIC_URL:-http://localhost:8088}"
curl --fail --silent --show-error "$BASE_URL/api/health/live"
echo
curl --fail --silent --show-error "$BASE_URL/api/health/ready"
echo
docker compose ps
