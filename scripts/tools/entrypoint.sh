#!/bin/sh
set -e
corepack enable
pnpm install --frozen-lockfile --prefer-offline
exec "$@"
