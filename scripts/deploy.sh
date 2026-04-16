#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$HOME/db_backups"
KEEP_BACKUPS=2

TAG="${1:?Usage: deploy.sh <tag>}"

cd "$REPO_DIR"

# .env에서 DB 인증 정보 로드
set -a
source .env
set +a

# 1. 태그 체크아웃
echo "[Deploy] Fetching tags..."
git fetch --tags --force
echo "[Deploy] Checking out $TAG..."
git checkout "$TAG"

# 2. DB 백업 (migration 실행 전에 반드시 선행)
echo "[Deploy] Backing up database..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/$(date +%Y%m%d-%H%M%S).sql"
docker exec -e "MYSQL_PWD=$DB_PSWD" mysql_container \
  mysqldump -u "$DB_USER" --single-transaction "$DB_DTBS" > "$BACKUP_FILE"
echo "[Deploy] Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# 3. 오래된 백업 삭제 (최근 N개만 유지)
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -1t ./*.sql 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
cd "$REPO_DIR"
echo "[Deploy] Backups retained: $KEEP_BACKUPS"

# 4. 이미지 빌드 + 컨테이너 교체
echo "[Deploy] Building and starting containers..."
docker compose up -d --build

# 5. 이전 이미지 정리
echo "[Deploy] Cleaning up dangling images..."
docker image prune -f

echo "[Deploy] Done. Tag $TAG deployed successfully."
