/**
 * Helper Kurva S.
 *
 * PENTING: tidak ada data reel yang dibuat di sini.
 * Series dibangun dari `planned_curve` dan `actual_curve`
 * yang dikembalikan endpoint GET /api/projects/{project}/curve.
 *
 * Aturan:
 * - Planned = nilai kumulatif rencana pada tanggal tersebut (step, tidak diedorong).
 * - Actual  = nilai realisasi terakhir yang tercatat pada/sebelum tanggal tersebut.
 *   Jika belum ada satu pun catatan actual <= tanggal, nilainya `null`
 *   (chart tidak memalsukan garis).
 * - Variance hanya dihitung jika planned & actual sama-sama tersedia.
 */

function toTime(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function sortByDate(list, key = 'date') {
  return [...list]
    .filter((item) => toTime(item?.[key]) !== null)
    .sort((a, b) => toTime(a[key]) - toTime(b[key]))
}

function round(value, digits = 2) {
  const factor = 10 ** digits

  return Math.round(value * factor) / factor
}

function chartLabel(isoDate) {
  const date = new Date(isoDate)

  if (Number.isNaN(date.getTime())) return isoDate

  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ][date.getMonth()]

  return `${month} ${date.getFullYear()}`
}

export function buildCurveSeries(curve) {
  const planned = sortByDate(curve?.planned_curve ?? [])
  const actual = sortByDate(curve?.actual_curve ?? [])

  const dates = Array.from(
    new Set([...planned.map((p) => p.date), ...actual.map((a) => a.date)])
  ).sort((a, b) => toTime(a) - toTime(b))

  let plannedCursor = -1
  let actualCursor = -1

  return dates.map((date) => {
    while (
      plannedCursor + 1 < planned.length &&
      toTime(planned[plannedCursor + 1].date) <= toTime(date)
    ) {
      plannedCursor += 1
    }

    while (
      actualCursor + 1 < actual.length &&
      toTime(actual[actualCursor + 1].date) <= toTime(date)
    ) {
      actualCursor += 1
    }

    const plannedPoint = plannedCursor >= 0 ? planned[plannedCursor] : null
    const actualPoint = actualCursor >= 0 ? actual[actualCursor] : null

    /* Sebelum titik rencana pertama, rencana dianggap 0% (baseline
       tanggal mulai proyek). Dengan begitu variance tetap terhitung
       walau realisasi tercatat di awal periode. */
    const plannedValue =
      plannedCursor < 0
        ? (planned.length > 0 ? 0 : null)
        : plannedPoint?.cumulative_percent === null ||
          plannedPoint?.cumulative_percent === undefined
          ? null
          : Number(plannedPoint.cumulative_percent)

    const actualValue =
      actualPoint?.progress_percent === null || actualPoint?.progress_percent === undefined
        ? null
        : Number(actualPoint.progress_percent)

    return {
      date,
      label: chartLabel(date),
      month: plannedPoint?.month ?? null,
      monthlyPlanned:
        plannedPoint?.monthly_percent === null || plannedPoint?.monthly_percent === undefined
          ? null
          : Number(plannedPoint.monthly_percent),
      planned: plannedValue,
      actual: actualValue,
      variance:
        plannedValue === null || actualValue === null
          ? null
          : round(actualValue - plannedValue, 2),
    }
  })
}

/**
 * Ringkasan untuk summary card.
 * `plannedProgress` diambil dari titik rencana terakhir yang
 * tanggalnya sudah terlewati (atau titik rencana terakhir).
 */
export function summarizeCurve(curve) {
  const series = buildCurveSeries(curve)
  const now = Date.now()

  const elapsed = series.filter((point) => toTime(point.date) <= now)
  const plannedPoint =
    elapsed.length > 0 ? elapsed[elapsed.length - 1] : series.find((p) => p.planned !== null)

  const lastActual = [...series].reverse().find((point) => point.actual !== null)

  const currentPlanned = plannedPoint?.planned ?? null
  const currentActual =
    curve?.actual_current_percent === null || curve?.actual_current_percent === undefined
      ? (lastActual?.actual ?? null)
      : Number(curve.actual_current_percent)

  const variance =
    currentPlanned === null || currentActual === null
      ? null
      : round(currentActual - currentPlanned, 2)

  const periodIndex = computePeriodIndex(curve?.project?.start_date, now)
  const totalMonths = series.filter((point) => point.month !== null).length || null

  return {
    series,
    plannedProgress: currentPlanned,
    actualProgress: currentActual,
    variance,
    currentPeriod: periodIndex,
    totalMonths,
    hasPlanned: series.some((point) => point.planned !== null),
    hasActual: series.some((point) => point.actual !== null),
    lastActualDate: lastActual?.date ?? null,
    lastPlannedDate: plannedPoint?.date ?? null,
  }
}

/**
 * Menentukan "Bulan ke-N" proyek pada tanggal tertentu,
 * mengikuti definisi backend: bulan ke-1 = bulan pertama proyek.
 */
export function computePeriodIndex(startDate, reference = Date.now()) {
  const start = toTime(startDate)

  if (start === null) return null

  const monthDiff =
    (new Date(reference).getFullYear() - new Date(start).getFullYear()) * 12 +
    (new Date(reference).getMonth() - new Date(start).getMonth())

  return monthDiff + 1
}