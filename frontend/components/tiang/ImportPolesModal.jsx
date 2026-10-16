'use client'

import { useMemo, useRef, useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'

import {
  HEADER_ALIASES,
  TEMPLATE_CSV,
  parseCsv,
  resolveHeaderMapping,
  validateRows,
} from '../../lib/csv-import'
import { formatNumber } from '../../lib/format'
import { tone } from '../../lib/theme'
import { cn } from '../../lib/utils'
import { ActionButton } from '../layout/PageHeader'
import { EmptyState } from '../ui/empty-state'
import { Badge } from '../ui/badge'
import { Table, Td, Th, Tr } from '../ui/table'
import { Modal } from '../ui/modal'

const MAX_PREVIEW_ROWS = 200

/**
 * Dialog import tiang dari CSV.
 *
 * Yang dilakukan halaman ini:
 *  1. membaca file sepenuhnya di browser (tidak ada upload),
 *  2. memetakan header ke nama field API,
 *  3. memvalidasi tiap baris terhadap `PoleController@store`,
 *  4. menampilkan jumlah baris valid / error dan pratinjau.
 *
 * Yang SENGAJA tidak dilakukan: mengirim apa pun ke server.
 * `routes/api.php` tidak punya endpoint import. Menampilkan tombol
 * "Impor" yang diam-diam looping 1.500 POST satu per satu akan
 * terlihat berhasil di layar selama beberapa detik, lalu gagal di
 * tengah jalan dan meninggalkan data setengah jadi — itu lebih buruk
 * daripada menampilkan requirement yang jelas.
 */
export function ImportPolesModal({ open, onClose, regions }) {
  const fileRef = useRef(null)

  const [fileName, setFileName] = useState(null)
  const [parseResult, setParseResult] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [showOnlyErrors, setShowOnlyErrors] = useState(false)

  const validation = useMemo(() => {
    if (!parseResult?.rows?.length) return null

    const [headerRow, ...dataRows] = parseResult.rows
    const { mapping, unknown } = resolveHeaderMapping(headerRow)

    return {
      mapping,
      unknown,
      entries: validateRows({ rows: dataRows, mapping, regions }),
    }
  }, [parseResult, regions])

  const stats = useMemo(() => {
    const entries = validation?.entries ?? []
    const valid = entries.filter((entry) => entry.isValid).length

    return {
      total: entries.length,
      valid,
      invalid: entries.length - valid,
    }
  }, [validation])

  function reset() {
    setFileName(null)
    setParseResult(null)
    setParseError(null)
    setShowOnlyErrors(false)

    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]

    if (!file) return

    setParseError(null)
    setParseResult(null)
    setFileName(file.name)

    /* 5 MB sudah jauh di atas kebutuhan 1.500 baris tiang. */
    if (file.size > 5 * 1024 * 1024) {
      setParseError(
        `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 5 MB.`
      )

      return
    }

    try {
      const text = await file.text()
      const result = parseCsv(text)

      if (!result.rows.length) {
        setParseError('File kosong atau tidak bisa dibaca sebagai CSV.')

        return
      }

      setParseResult(result)
    } catch (error) {
      setParseError(error?.message ?? 'File gagal dibaca.')
    }
  }

  function downloadTemplate() {
    /* BOM supaya Excel di Windows tidak salah baca UTF-8. */
    const blob = new Blob([`\uFEFF${TEMPLATE_CSV}`], {
      type: 'text/csv;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'template-import-tiang.csv'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const visibleEntries = useMemo(() => {
    const entries = validation?.entries ?? []

    if (!showOnlyErrors) return entries.slice(0, MAX_PREVIEW_ROWS)

    return entries.filter((entry) => !entry.isValid).slice(0, MAX_PREVIEW_ROWS)
  }, [showOnlyErrors, validation])

  const missingRequired = validation && validation.mapping.pole_code === undefined

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="Import Tiang dari CSV"
      description="Validasi file di perangkat ini dulu. Pengiriman ke server belum tersedia di backend."
      footer={
        <>
          <ActionButton onClick={downloadTemplate} icon={Download}>
            Unduh Template
          </ActionButton>

          <ActionButton onClick={handleClose}>Tutup</ActionButton>
        </>
      }
    >
      <div className="space-y-5">
        {parseError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-clay-300/70 bg-clay-50 px-4 py-3"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-clay-700" />

            <p className="text-xs leading-5 text-clay-700">{parseError}</p>
          </div>
        )}

        <div className="rounded-card border-2 border-dashed border-neutral-300 bg-canvas px-5 py-6 text-center">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-neutral-400" />

          <p className="mt-3 text-sm font-medium text-neutral-800">
            {fileName ?? 'Belum ada file dipilih'}
          </p>

          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-neutral-500">
            Maksimal 5 MB. Separator otomatis: koma, titik koma, tab, atau
            garis vertikal. Baris pertama diperlakukan sebagai judul kolom.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <ActionButton onClick={() => fileRef.current?.click()} icon={Upload}>
              Pilih File CSV
            </ActionButton>

            <ActionButton onClick={downloadTemplate} icon={Download} variant="subtle">
              Unduh Template
            </ActionButton>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="sr-only"
          />
        </div>

        {validation && missingRequired && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

            <div>
              <p className="text-sm font-semibold text-amber-900">
                Judul kolom kode tiang tidak ditemukan
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                Yang dikenali:{' '}
                {Object.entries(HEADER_ALIASES)
                  .map(([field, aliases]) => `${field} (${aliases[0]})`)
                  .join(', ')}
                .
              </p>
            </div>
          </div>
        )}

        {validation && !missingRequired && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Baris terbaca"
                value={formatNumber(stats.total)}
                tone="neutral"
              />

              <StatTile
                label="Baris valid"
                value={formatNumber(stats.valid)}
                tone="sage"
                Icon={CircleCheck}
              />

              <StatTile
                label="Baris bermasalah"
                value={formatNumber(stats.invalid)}
                tone={stats.invalid ? 'clay' : 'neutral'}
                Icon={stats.invalid ? CircleAlert : undefined}
              />
            </div>

            {validation.unknown.length > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-canvas px-4 py-3">
                <p className="text-xs text-neutral-500">
                  Kolom yang diabaikan:{' '}
                  <strong className="text-neutral-700">
                    {validation.unknown
                      .map((column) => `"${column.value}"`)
                      .join(', ')}
                  </strong>
                  . Baris tetap diimpor tanpa kolom tersebut.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                Pratinjau Validasi
              </h3>

              {stats.invalid > 0 && (
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={showOnlyErrors}
                    onChange={(event) => setShowOnlyErrors(event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-400"
                  />
                  Tampilkan baris bermasalah saja
                </label>
              )}
            </div>

            {visibleEntries.length ? (
              <div className="overflow-x-auto rounded-card border border-neutral-200">
                <Table className="min-w-[720px]">
                  <thead>
                    <tr>
                      <Th align="center">Baris</Th>
                      <Th>Kode Tiang</Th>
                      <Th>Wilayah</Th>
                      <Th align="right">Lat</Th>
                      <Th align="right">Lng</Th>
                      <Th>Status</Th>
                      <Th>Hasil</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleEntries.map((entry) => (
                      <Tr key={entry.lineNumber}>
                        <Td align="center" className="tabular-nums text-neutral-500">
                          {entry.lineNumber}
                        </Td>

                        <Td className="font-medium text-neutral-900">
                          {entry.values.pole_code || '—'}
                        </Td>

                        <Td>
                          {entry.values.region_id
                            ? `#${entry.values.region_id}`
                            : '—'}
                        </Td>

                        <Td align="right" className="tabular-nums">
                          {entry.values.latitude ?? '—'}
                        </Td>

                        <Td align="right" className="tabular-nums">
                          {entry.values.longitude ?? '—'}
                        </Td>

                        <Td>{entry.values.status ?? '—'}</Td>

                        <Td>
                          {entry.isValid ? (
                            <Badge tone="sage" size="sm">
                              Valid
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              {entry.errors.map((error) => (
                                <p
                                  key={error.field + error.message}
                                  className="text-[11px] leading-5 text-clay-700"
                                >
                                  {error.message}
                                </p>
                              ))}
                            </div>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <EmptyState
                compact
                icon={CircleCheck}
                title="Tidak ada baris untuk ditampilkan"
                description={
                  stats.total === 0
                    ? 'File hanya berisi judul kolom, tanpa data tiang.'
                    : 'Semua baris valid dan tidak ada yang perlu diperbaiki.'
                }
              />
            )}

            {(stats.total > MAX_PREVIEW_ROWS ||
              (showOnlyErrors && stats.invalid > MAX_PREVIEW_ROWS)) && (
              <p className="text-xs text-neutral-400">
                Pratinjau dibatasi {MAX_PREVIEW_ROWS} baris pertama dari{' '}
                {formatNumber(stats.total)} baris yang terbaca.
              </p>
            )}
          </>
        )}

        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

          <div>
            <p className="text-sm font-semibold text-amber-900">
              Endpoint import belum tersedia
            </p>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">
              Setelah file ini valid, backend masih butuh route untuk menyimpan
              sekaligus. Yang dibutuhkan di Laravel:{' '}
              <code className="rounded bg-paper px-1.5 py-0.5 text-[11px]">
                POST /api/projects/{'{project}'}/poles/import
              </code>{' '}
              dengan body{' '}
              <code className="rounded bg-paper px-1.5 py-0.5 text-[11px]">
                {'{ rows: [...], mode: "insert" }'}
              </code>
              . Detailnya ada di laporan akhir.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function StatTile({ label, value, tone: toneName = 'neutral', Icon }) {
  const resolved = tone(toneName)

  return (
    <div className="rounded-card border border-neutral-200 bg-paper px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>

      <p
        className={cn(
          'mt-1 font-display text-xl font-semibold tabular-nums',
          toneName === 'neutral' ? 'text-neutral-900' : resolved.text
        )}
      >
        {value}
      </p>
    </div>
  )
}
