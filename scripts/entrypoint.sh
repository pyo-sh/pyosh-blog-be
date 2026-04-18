#!/bin/sh
# Container entrypoint: run drizzle migrations, then start the server.
# Using `exec` replaces the shell with node so SIGTERM from docker reaches
# node directly for graceful shutdown.
set -e

echo "[Entrypoint] Running database migrations..."
node ./build/src/scripts/migrate.js

echo "[Entrypoint] Starting server..."
export APP_VERSION="$(node -p "require('./package.json').version")"
exec node ./build/src/server.js
