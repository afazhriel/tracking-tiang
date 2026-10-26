-- Tracking Tiang: review-only preview of the corrective migration.
-- Run ONLY against an isolated, current staging backup/snapshot.
-- This query does not change rows. Do not paste production credentials in CI.
-- Query predicates are intentionally aligned with
-- backend/database/migrations/2026_10_26_120000_restore_historical_pole_progress_source.php.

SELECT
    p.id AS project_id,
    p.code AS project_code,
    p.progress_source AS current_progress_source,
    p.total_target_poles,
    p.target_quantity,
    (
        SELECT COUNT(*)
        FROM poles AS pole
        JOIN pole_progress_histories AS history ON history.pole_id = pole.id
        WHERE pole.project_id = p.id
    ) AS historical_progress_rows,
    (
        SELECT COUNT(*)
        FROM project_quantity_entries AS quantity
        WHERE quantity.project_id = p.id
    ) AS quantity_entry_rows
FROM projects AS p
WHERE p.progress_source = 'quantity_entries'
  AND p.code <> 'TANKI --01'
  AND p.total_target_poles > 0
  AND p.target_quantity IS NOT NULL
  AND p.target_quantity = p.total_target_poles
  AND EXISTS (
      SELECT 1
      FROM poles AS pole
      JOIN pole_progress_histories AS history ON history.pole_id = pole.id
      WHERE pole.project_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM project_quantity_entries AS quantity
      WHERE quantity.project_id = p.id
  )
ORDER BY p.id;

-- Expected review outcome:
-- 1. Owner reviews all project IDs; none should be a legitimate quantity project.
-- 2. The protected TANKI --01 project should never appear.
-- 3. Compare before/after history totals, quantity fingerprints, and curves.
-- 4. If the project set is not fully understood, block release and investigate.
