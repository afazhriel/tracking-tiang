#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/opt/tracking-tiang"
BACKUP_DIR="$COMPOSE_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

cd "$COMPOSE_DIR" || fail "Direktori $COMPOSE_DIR tidak ditemukan"
mkdir -p "$BACKUP_DIR"

echo "======================================================"
echo " AUDIT TRACKING TIANG — $TIMESTAMP"
echo "======================================================"

if [ ! -f .env ]; then fail "File .env tidak ditemukan di $COMPOSE_DIR"; fi
PG_DB=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2- | tr -d '"')
PG_USER=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d '"')
info "Database utama : $PG_DB"
info "PostgreSQL user: $PG_USER"

info "Status containers:"
docker compose ps 2>/dev/null || docker-compose ps

BACKEND_RUNNING=$(docker inspect -f '{{.State.Running}}' tracking-tiang-backend 2>/dev/null || echo "false")
POSTGRES_RUNNING=$(docker inspect -f '{{.State.Running}}' tracking-tiang-postgres 2>/dev/null || echo "false")
[ "$POSTGRES_RUNNING" = "true" ] || fail "Container postgres TIDAK berjalan!"
[ "$BACKEND_RUNNING" = "true" ]  || fail "Container backend TIDAK berjalan!"
success "Kedua container berjalan."

pg_exec() { docker exec tracking-tiang-postgres psql -U "$PG_USER" -d "$1" -t -A -c "$2" 2>/dev/null; }

info "=== AUDIT DATABASE UTAMA ($PG_DB) ==="
for TABLE in projects users poles work_items pole_work_progress pole_progress_histories; do
  COUNT=$(pg_exec "$PG_DB" "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "ERROR")
  echo "  $TABLE: $COUNT baris"
done

RECOVERY_DB="tracking_tiang_recovery"
REC_EXISTS=$(pg_exec postgres "SELECT 1 FROM pg_database WHERE datname='$RECOVERY_DB';" 2>/dev/null || echo "")
if [ -n "$REC_EXISTS" ]; then
  info "=== AUDIT DATABASE RECOVERY ($RECOVERY_DB) ==="
  for TABLE in projects users poles work_items pole_work_progress pole_progress_histories; do
    COUNT=$(pg_exec "$RECOVERY_DB" "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "ERROR")
    echo "  $TABLE: $COUNT baris"
  done
  success "Database recovery ditemukan."
else
  warn "Database $RECOVERY_DB tidak ditemukan!"
fi

info "=== AUDIT BACKEND LARAVEL ==="
docker exec tracking-tiang-backend php artisan --version 2>/dev/null || warn "Artisan error"
info "Status migrasi:"
docker exec tracking-tiang-backend php artisan migrate:status 2>/dev/null | tail -20 || warn "migrate:status error"
info "Konfigurasi DB backend:"
docker exec tracking-tiang-backend grep -E '^DB_' /var/www/html/.env 2>/dev/null | grep -v PASSWORD | grep -v SECRET || warn ".env backend tidak ditemukan"

info "=== TEST API ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@x.com","password":"wrong"}' 2>/dev/null || echo "000")
echo "  POST /api/login (credentials salah): HTTP $HTTP_CODE (harapan: 401 atau 422)"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/projects 2>/dev/null || echo "000")
echo "  GET /api/projects (tanpa token): HTTP $HTTP_CODE (harapan: 401)"

info "=== DAFTAR BACKUP YANG ADA ==="
ls -lh "$BACKUP_DIR"/ 2>/dev/null || info "Belum ada backup"

info "=== MEMBUAT BACKUP DATABASE UTAMA ==="
BACKUP_FILE="$BACKUP_DIR/tracking_tiang_before_fix_$TIMESTAMP.dump"
docker exec tracking-tiang-postgres \
  pg_dump -U "$PG_USER" "$PG_DB" --format=custom \
  > "$BACKUP_FILE" 2>/dev/null

if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  success "Backup berhasil: $BACKUP_FILE ($SIZE)"
else
  fail "Backup GAGAL atau file kosong!"
fi

echo ""
echo "======================================================"
echo " AUDIT SELESAI. Backup: $BACKUP_FILE"
echo " Langkah berikutnya: bash 02_restore_data.sh"
echo "======================================================"
