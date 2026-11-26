/*
 * Label satuan proyek.
 *
 * `unit_code` di database adalah kode bebas (pole, unit, tangki, paket,
 * km, ...). Fungsi di sini menerjemahkannya menjadi nama tampilan agar
 * layar tidak mengunci kata "Tiang" untuk proyek yang satuannya bukan
 * tiang. 'pole' adalah kode historis untuk tiang.
 */

const UNIT_LABELS = {
  pole: 'Tiang',
  unit: 'Unit',
  tangki: 'Tangki',
  paket: 'Paket',
  km: 'Kilometer',
  titik: 'Lokasi',
  mesin: 'Mesin',
  pks: 'PKS',
}

export function unitLabel(code) {
  if (!code) return 'Tiang'
  const key = String(code).toLowerCase()
  if (UNIT_LABELS[key]) return UNIT_LABELS[key]
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function unitLabelLower(code) {
  return unitLabel(code).toLowerCase()
}

/* Terima proyek ternormalisasi (unitCode) maupun mentah (unit_code). */
export function projectUnitLabel(project) {
  return unitLabel(project?.unitCode ?? project?.unit_code)
}

export function projectUnitLower(project) {
  return unitLabelLower(project?.unitCode ?? project?.unit_code)
}
