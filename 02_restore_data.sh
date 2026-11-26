#!/usr/bin/env bash
set -euo pipefail

cd /opt/tracking-tiang
TS=$(date +%Y%m%d_%H%M%S)
PG="docker exec tracking-tiang-postgres"

echo "== [1/6] Cek pg_dump berjalan =="
if ps aux | grep -v grep | grep -q pg_dump; then
  echo "MASIH ADA pg_dump berjalan. Tunggu selesai, lalu jalankan ulang."
  exit 1
fi

echo "== [2/6] Pastikan backend stop =="
docker stop tracking-tiang-backend 2>/dev/null || true

echo "== [3/6] Bersihkan target (idempotent) =="
$PG psql -U tracking_admin -d tracking_tiang -c "TRUNCATE provinces,regencies,districts,villages,projects,poles,work_items,pole_work_progress,pole_progress_histories RESTART IDENTITY CASCADE;"

echo "== [4/6] Import recovery -> main =="
for t in provinces regencies districts villages projects poles work_items pole_work_progress pole_progress_histories; do
  echo ">> $t"
  $PG pg_dump -U tracking_admin -d tracking_tiang_recovery --data-only --column-inserts -t "$t" \
    | docker exec -i tracking-tiang-postgres psql -U tracking_admin -d tracking_tiang -v ON_ERROR_STOP=1 -o /dev/null
done

echo "== [5/6] Reset sequence & start backend =="
for t in projects poles work_items pole_work_progress pole_progress_histories; do
  $PG psql -U tracking_admin -d tracking_tiang -c "SELECT setval(pg_get_serial_sequence('$t','id'), (SELECT COALESCE(MAX(id),1) FROM $t));"
done
docker start tracking-tiang-backend

echo "== [6/6] Verifikasi =="
$PG psql -U tracking_admin -d tracking_tiang -tA -c "select 'projects',count(*) from projects union all select 'poles',count(*) from poles union all select 'work_items',count(*) from work_items union all select 'pole_work_progress',count(*) from pole_work_progress union all select 'pole_progress_histories',count(*) from pole_progress_histories union all select 'provinces',count(*) from provinces union all select 'regencies',count(*) from regencies union all select 'districts',count(*) from districts union all select 'villages',count(*) from villages;"
echo "SELESAI TS=$TS"
