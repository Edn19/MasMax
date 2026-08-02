#!/bin/sh
set -eu
: "${ADMIN_ACCESS_TOKEN:?ADMIN_ACCESS_TOKEN es obligatorio}"
BASE_URL="${APP_PUBLIC_URL:-http://localhost:8088}"
curl --fail --silent --show-error -X POST -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" "$BASE_URL/api/admin/storage/cleanup"
echo
