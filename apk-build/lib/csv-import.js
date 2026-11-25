/**
 * Parser CSV minimal untuk pratinjau import tiang.
 *
 * Ditulis tangan, bukan pakai library, karena kebutuhannya sempit:
 * separator koma/semicolon/tab, header baris pertama, dan quoted
 * field sederhana. Menghemat satu dependency untuk sesuatu yang
 * hanya dipakai di browser.
 *
 * Tidak ada data yang dikirim ke mana pun — file dibaca sepenuhnya
 * di sisi klien, lalu barisnya divalidasi terhadap aturan yang sama
 * dengan `PoleController@store`.
 */

const DELIMITERS = [',', ';', '\t', '|']

/* Alias header → nama field API, supaya file dari Excel dengan
   judul kolom Bahasa Indonesia tetap bisa dipetakan. */
export const HEADER_ALIASES = {
  pole_code: ['pole_code', 'polecode', 'kode_tiang', 'kode', 'code', 'kode tiang'],
  region_id: ['region_id', 'regionid', 'id_wilayah', 'wilayah_id', 'region'],
  region_code: ['region_code', 'kode_wilayah', 'kode wilayah'],
  province_id: ['province_id', 'provinceid', 'id_provinsi', 'kode_provinsi', 'provinsi_id'],
  regency_id: ['regency_id', 'regencyid', 'id_kabupaten', 'id_kabkota', 'kabupaten_id', 'kabkota_id'],
  district_id: ['district_id', 'districtid', 'id_kecamatan', 'kecamatan_id'],
  village_id: ['village_id', 'villageid', 'id_desa', 'desa_id', 'kelurahan_id'],
  address: ['address', 'alamat', 'lokasi', 'location'],
  latitude: ['latitude', 'lat', 'lintang'],
  longitude: ['longitude', 'lng', 'lon', 'bujur', 'long'],
  status: ['status', 'kondisi', 'state'],
}

function detectDelimiter(line) {
  let best = DELIMITERS[0]
  let bestCount = -1

  for (const delimiter of DELIMITERS) {
    let count = 0
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]

      if (char === '"') inQuotes = !inQuotes
      else if (char === delimiter && !inQuotes) count += 1
    }

    if (count > bestCount) {
      bestCount = count
      best = delimiter
    }
  }

  return best
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function resolveHeaderMapping(headerCells) {
  const mapping = {}
  const unknown = []

  headerCells.forEach((cell, index) => {
    const normalized = normalizeHeader(cell)

    if (!normalized) return

    const match = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized)
    )

    if (match) {
      /* Kolom pertama yang cocok menang — duplikat diabaikan
         diam-diam supaya tidak menimpa nilai yang sudah terbaca. */
      if (mapping[match[0]] === undefined) mapping[match[0]] = index
    } else {
      unknown.push({ index, value: String(cell).trim() })
    }
  })

  return { mapping, unknown }
}

/**
 * Pecah teks CSV jadi array baris.
 * Mengembalikan `{ rows, delimiter, totalLines }`.
 */
export function parseCsv(text) {
  /* Buang BOM — Excel di Windows routinely menambahkannya. */
  const content = String(text ?? '').replace(/^\uFEFF/, '')

  if (!content.trim()) {
    return { rows: [], delimiter: ',', totalLines: 0 }
  }

  const firstLine = content.split(/\r?\n/, 1)[0]
  const delimiter = detectDelimiter(firstLine)

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (inQuotes) {
      if (char === '"') {
        /* `""` di dalam quoted field = satu karakter kutip. */
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }

      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  row.push(field)
  rows.push(row)

  /* Buang baris kosong di ekor file. */
  while (rows.length && rows[rows.length - 1].every((cell) => !cell.trim())) {
    rows.pop()
  }

  return { rows, delimiter, totalLines: rows.length }
}

function cellAt(row, index) {
  if (index === undefined || index === null || index < 0) return ''

  return String(row[index] ?? '').trim()
}

/**
 * Validasi tiap baris terhadap aturan `PoleController@store`.
 * `regions` dipakai untuk mengecek `region_id` benar-benar ada.
 */
export function validateRows({ rows, mapping, regions }) {
  const regionIds = new Set((regions ?? []).map((region) => Number(region.id)))
  const regionCodes = new Map(
    (regions ?? []).map((region) => [String(region.code ?? '').trim(), region.id])
  )

  const seenCodes = new Map()

  return rows
    .map((row, rowIndex) => {
      /* +2: 1 untuk header, 1 lagi supaya nomornya cocok dengan
         tampilan di Excel / Google Sheets. */
      const lineNumber = rowIndex + 2
      const errors = []

      const poleCode = cellAt(row, mapping.pole_code)

      if (!poleCode) {
        errors.push({ field: 'pole_code', message: 'Kode tiang wajib diisi.' })
      } else if (poleCode.length > 255) {
        errors.push({
          field: 'pole_code',
          message: 'Kode tiang maksimal 255 karakter.',
        })
      } else if (seenCodes.has(poleCode)) {
        errors.push({
          field: 'pole_code',
          message: `Kode "${poleCode}" sudah muncul di baris ${seenCodes.get(poleCode)}.`,
        })
      }

      if (!seenCodes.has(poleCode) && poleCode) seenCodes.set(poleCode, lineNumber)

      /* Wilayah boleh diisi dengan `region_id` maupun `region_code`
         supaya file dari lapangan tidak wajib tahu id internal. */
      const rawRegionId = cellAt(row, mapping.region_id)
      const rawRegionCode = cellAt(row, mapping.region_code)
      let regionId = null

      if (rawRegionId) {
        regionId = Number(rawRegionId)

        if (!Number.isInteger(regionId)) {
          errors.push({
            field: 'region_id',
            message: `Wilayah "${rawRegionId}" bukan angka.`,
          })
          regionId = null
        } else if (regionIds.size && !regionIds.has(regionId)) {
          errors.push({
            field: 'region_id',
            message: `Wilayah dengan id ${regionId} tidak ada di project ini.`,
          })
          regionId = null
        }
      } else if (rawRegionCode) {
        const match = regionCodes.get(rawRegionCode)

        if (!match) {
          errors.push({
            field: 'region_id',
            message: `Kode wilayah "${rawRegionCode}" tidak terdaftar.`,
          })
        } else {
          regionId = match
        }
      }

      const rawLat = cellAt(row, mapping.latitude)
      const rawLng = cellAt(row, mapping.longitude)

      const latitude = rawLat === '' ? null : Number(rawLat)
      const longitude = rawLng === '' ? null : Number(rawLng)

      if (rawLat !== '' && !Number.isFinite(latitude)) {
        errors.push({
          field: 'latitude',
          message: `Latitude "${rawLat}" bukan angka.`,
        })
      } else if (latitude !== null && (latitude < -90 || latitude > 90)) {
        errors.push({
          field: 'latitude',
          message: `Latitude ${latitude} di luar rentang -90 sampai 90.`,
        })
      }

      if (rawLng !== '' && !Number.isFinite(longitude)) {
        errors.push({
          field: 'longitude',
          message: `Longitude "${rawLng}" bukan angka.`,
        })
      } else if (longitude !== null && (longitude < -180 || longitude > 180)) {
        errors.push({
          field: 'longitude',
          message: `Longitude ${longitude} di luar rentang -180 sampai 180.`,
        })
      }

      const status = cellAt(row, mapping.status)
      const address = cellAt(row, mapping.address)

      if (status.length > 50) {
        errors.push({
          field: 'status',
          message: 'Status maksimal 50 karakter.',
        })
      }

      return {
        lineNumber,
        values: {
          pole_code: poleCode,
          region_id: regionId,
          province_id: cellAt(row, mapping.province_id) || null,
          regency_id: cellAt(row, mapping.regency_id) || null,
          district_id: cellAt(row, mapping.district_id) || null,
          village_id: cellAt(row, mapping.village_id) || null,
          address: address || null,
          latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null,
          longitude:
            longitude !== null && Number.isFinite(longitude) ? longitude : null,
          status: status || null,
        },
        errors,
        isValid: errors.length === 0,
      }
    })
    .filter((entry) => entry.values.pole_code || entry.errors.length)
}

/** Template CSV untuk diunduh user — kolom mengikuti HEADER_ALIASES. */
export const TEMPLATE_CSV = [
  'kode_tiang,kode_wilayah,alamat,latitude,longitude,status',
  'TLG-001,WK-01,Jalan Merdeka No. 1,-6.9127,107.6186,rencana',
  'TLG-002,WK-01,Jalan Merdeka No. 2,-6.9130,107.6190,proses',
].join('\n')

