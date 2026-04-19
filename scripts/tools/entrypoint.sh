#!/bin/sh
set -e
# argon2 requires native build tools on ARM (same as Dockerfile:13-17)
apt-get update -qq
apt-get install -y --no-install-recommends python3 make g++
rm -rf /var/lib/apt/lists/*
corepack enable
pnpm install --frozen-lockfile --prefer-offline
exec "$@"
