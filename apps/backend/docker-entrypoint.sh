#!/bin/sh
set -eu
mkdir -p /app/uploads/videos /app/uploads/images /app/uploads/tmp /app/uploads/hls
chown -R node:node /app/uploads
exec su-exec node "$@"
