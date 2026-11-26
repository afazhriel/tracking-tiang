'use client'

import { useEffect, useState } from 'react'

import { api, unwrapList } from '../../lib/api'
import { projectUnitLabel, projectUnitLower } from '../../lib/unit-label'

const STATUS_LABEL = {
  rencana: 'Rencana — Belum mulai',
  proses: 'Proses — Sedang dikerjakan',
  active: 'Aktif',
  selesai: 'Selesai — Tuntas 100%',
  terlambat: 'Terlambat',
  kendala: 'Kendala — Bermasalah',
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const ROLE_LABEL = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  pic: 'PIC Lapangan',
}

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

export default function SuratJobPage() {
  const [params, setParams] = useState(null)
  const [project, setProject] = useState(null)
  const [poles, setPoles] = useState([])
  const [allPoleCount, setAllPoleCount] = useState(0)
  const [teams, setTeams] = useState([])
  const [team, setTeam] = useState(null)
  const [members, setMembers] = useState([])
  const [progress, setProgress] = useState({})
  const [regencyNames, setRegencyNames] = useState({})
  const [districtNames, setDistrictNames] = useState({})
  const [quantityEntries, setQuantityEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setParams({ proyek: q.get('proyek'), tim: q.get('tim') })
    const t = setTimeout(() => {
      try {
        if (!window.localStorage.getItem('tracking_tiang_user')) {
          window.location.href = '/login'
        }
      } catch {
        /* abaikan */
      }
    }, 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!params) return
    if (!params.proyek) {
      setError('Parameter proyek tidak ditemukan. Buka surat ini dari halaman Proyek.')
      setLoading(false)
      return
    }

    let alive = true

    ;(async () => {
      try {
        const [projRes, poleRes, teamRes, memberRes] = await Promise.all([
          api.getProject(params.proyek),
          api.listPoles(params.proyek, { perPage: 100 }),
          api.listTeams({ projectId: params.proyek }),
          api.listProjectMembers(params.proyek).catch(() => null),
        ])
        if (!alive) return

        const projData = projRes?.data ?? projRes
        setProject(projData)
        setTeams(unwrapList(teamRes))
        setMembers(unwrapList(memberRes))

        if (projData?.progress_source === 'quantity_entries') {
          const qRes = await api.listProjectQuantities(params.proyek).catch(() => null)
          if (!alive) return
          const qData = qRes?.data ?? qRes
          const entries = qData?.data ?? qData?.entries ?? []
          setQuantityEntries(Array.isArray(entries) ? entries : [])
        }

        const allPoles = unwrapList(poleRes)
        setAllPoleCount(allPoles.length)

        let shown = allPoles
        if (params.tim) {
          const [teamRes2, asgRes] = await Promise.all([
            api.getTeam(params.tim),
            api.teamAssignments(params.tim),
          ])
          if (!alive) return
          setTeam(teamRes2?.data ?? teamRes2)
          const ids = new Set(
            unwrapList(asgRes).map((a) => Number(a.pole_id ?? a.pole?.id)),
          )
          shown = allPoles.filter((p) => ids.has(Number(p.id)))
        }
        setPoles(shown)

        /* Nama kabupaten/kecamatan untuk kolom wilayah. */
        const regMap = {}
        const distMap = {}
        const provIds = [...new Set(allPoles.map((p) => p.province_id).filter(Boolean))]
        for (const pid of provIds) {
          const regs = unwrapList(await api.listRegencies(pid).catch(() => null))
          regs.forEach((r) => {
            regMap[r.id] = r.name
          })
        }
        const regIds = [...new Set(allPoles.map((p) => p.regency_id).filter(Boolean))]
        for (const rid of regIds) {
          const dists = unwrapList(await api.listDistricts(rid).catch(() => null))
          dists.forEach((d) => {
            distMap[d.id] = d.name
          })
        }
        if (!alive) return
        setRegencyNames(regMap)
        setDistrictNames(distMap)

        /* Progres per tiang dari endpoint resmi (maks. 6 paralel). */
        const queue = [...shown]
        await Promise.all(
          Array.from({ length: 6 }, async () => {
            while (queue.length) {
              const pole = queue.shift()
              try {
                const payload = await api.getPoleProgress(params.proyek, pole.id)
                const v = payload?.pole_progress
                if (alive) {
                  setProgress((prev) => ({
                    ...prev,
                    [pole.id]: v === null || v === undefined ? null : Number(v),
                  }))
                }
              } catch {
                if (alive) {
                  setProgress((prev) => ({ ...prev, [pole.id]: null }))
                }
              }
            }
          }),
        )
      } catch {
        if (alive) setError('Data surat tidak dapat dimuat. Coba muat ulang halaman ini.')
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [params])

  const now = new Date()
  const nomor = project
    ? `SPK/${project.code || project.id}/${ROMAN[now.getMonth()]}/${now.getFullYear()}${team ? `/TIM-${team.id}` : ''}`
    : '—'

  const isQuantity = project?.progress_source === 'quantity_entries'
  const unitName = projectUnitLabel(project)
  const unitLower = projectUnitLower(project)
  const targetDisplay = isQuantity
    ? Number(project?.target_quantity ?? 0)
    : Number(project?.total_target_poles ?? 0)
  const quantityTotal = quantityEntries.reduce(
    (sum, e) => sum + Number(e.quantity_delta ?? 0),
    0,
  )
  const quantityPct = targetDisplay > 0 ? (quantityTotal / targetDisplay) * 100 : null

  const progressValues = poles
    .map((p) => progress[p.id])
    .filter((v) => v !== null && v !== undefined)
  const avgProgress = progressValues.length
    ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length
    : null
  const doneCount = progressValues.filter((v) => Number(v) >= 100).length

  const pelaksana = team ? team.users ?? [] : members

  const wilayah = (pole) => {
    const parts = []
    if (pole.district_id && districtNames[pole.district_id]) {
      parts.push(`Kec. ${districtNames[pole.district_id]}`)
    }
    if (pole.regency_id && regencyNames[pole.regency_id]) {
      parts.push(regencyNames[pole.regency_id])
    }
    if (pole.province?.name) parts.push(pole.province.name)
    return parts.length ? parts.join(', ') : '—'
  }

  const changeTeam = (value) => {
    const q = new URLSearchParams(window.location.search)
    if (value) q.set('tim', value)
    else q.delete('tim')
    window.location.search = q.toString()
  }

  return (
    <div className="min-h-screen bg-neutral-200 py-4 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4; margin: 16mm; } }`}</style>

      {/* Bilah alat — tidak ikut tercetak */}
      <div className="mx-auto mb-4 flex max-w-[840px] flex-wrap items-center gap-2 px-4 print:hidden">
        <a
          href="/proyek"
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          ← Kembali ke Proyek
        </a>
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600">
          Tim pelaksana:
          <select
            value={params?.tim ?? ''}
            onChange={(e) => changeTeam(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-800"
          >
            <option value="">Seluruh proyek</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          Cetak / Simpan PDF
        </button>
      </div>

      <div className="mx-auto max-w-[840px] bg-white p-8 shadow print:shadow-none sm:p-10">
        {loading && <p className="text-sm text-neutral-500">Memuat data surat…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && project && (
          <>
            {/* Kop surat — dari organisasi pemilik proyek (PT klien),
                bukan dari platform. Proyek tanpa organisasi memakai
                nama platform sebagai kop. */}
            <header className="text-center">
              {project.organization?.logo_url && (
                <img
                  src={project.organization.logo_url}
                  alt={`Logo ${project.organization?.name ?? 'organisasi'}`}
                  className="mx-auto mb-3 h-16 w-auto object-contain"
                />
              )}
              <p className="text-xl font-bold tracking-[0.2em] text-neutral-900">
                {(project.organization?.name ?? 'Tracking Pekerjaan').toUpperCase()}
              </p>
              {(project.organization?.address ||
                project.organization?.phone ||
                project.organization?.email) && (
                <p className="mt-1 text-sm text-neutral-600">
                  {[
                    project.organization?.address,
                    project.organization?.phone,
                    project.organization?.email,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                Sistem Monitoring Pekerjaan — pjl.ituiot.com
              </p>
              <div className="mt-4 border-b-4 border-double border-neutral-800" />
            </header>

            {/* Judul */}
            <div className="mt-4 text-center">
              <h1 className="text-lg font-bold uppercase text-neutral-900 underline">
                Surat Perintah Kerja
              </h1>
              <p className="text-sm text-neutral-600">(Job Order)</p>
              <p className="mt-2 text-sm text-neutral-800">
                Nomor: <span className="font-semibold">{nomor}</span>
              </p>
              <p className="mt-1 text-sm text-neutral-800">
                {fmtDate(now.toISOString())}
              </p>
            </div>

            {/* Penerima tugas */}
            <section className="mt-4 text-sm leading-relaxed text-neutral-800">
              <p>Dengan ini memberikan perintah kerja kepada:</p>
              <p className="mt-2 font-semibold text-neutral-900">
                {team ? `Tim ${team.name}` : 'Seluruh tim pelaksana proyek'}
              </p>
              {pelaksana.length > 0 && (
                <ol className="mt-1 list-decimal pl-6">
                  {pelaksana.map((u) => (
                    <li key={u.id}>
                      {u.name}
                      {u.role ? ` — ${ROLE_LABEL[u.role] ?? u.role}` : ''}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3">
                untuk melaksanakan pekerjaan pada proyek{' '}
                <strong>
                  {project.name} ({project.code})
                </strong>
                , periode {fmtDate(project.start_date)} s.d. {fmtDate(project.end_date)},
                dengan target {targetDisplay.toLocaleString('id-ID')} {unitLower}.{' '}
                {isQuantity
                  ? 'Rincian progres yang tercatat di sistem adalah sebagai berikut:'
                  : 'Rincian lokasi pekerjaan beserta progres terakhir yang tercatat di sistem adalah sebagai berikut:'}
              </p>
            </section>

            {/* Tabel pekerjaan — mode per titik lokasi */}
            {!isQuantity && (
            <table className="mt-4 w-full border-collapse text-[13px] text-neutral-800">
              <thead>
                <tr className="bg-neutral-100">
                  {['No', `Kode ${unitName}`, 'Alamat / Lokasi', 'Wilayah', 'Status', 'Progres'].map(
                    (h) => (
                      <th
                        key={h}
                        className="border border-neutral-400 px-2 py-1.5 text-left font-semibold"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {poles.map((pole, i) => (
                  <tr key={pole.id}>
                    <td className="border border-neutral-400 px-2 py-1.5">{i + 1}</td>
                    <td className="border border-neutral-400 px-2 py-1.5 font-medium">
                      {pole.pole_code}
                    </td>
                    <td className="border border-neutral-400 px-2 py-1.5">
                      {pole.address || '—'}
                      {pole.latitude && pole.longitude && (
                        <span className="block text-[11px] text-neutral-500">
                          {pole.latitude}, {pole.longitude}
                        </span>
                      )}
                    </td>
                    <td className="border border-neutral-400 px-2 py-1.5">{wilayah(pole)}</td>
                    <td className="border border-neutral-400 px-2 py-1.5">
                      {STATUS_LABEL[pole.status] ?? pole.status}
                    </td>
                    <td className="border border-neutral-400 px-2 py-1.5">
                      {fmtPct(progress[pole.id])}
                    </td>
                  </tr>
                ))}
                {poles.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-neutral-400 px-2 py-3 text-center text-neutral-500"
                    >
                      {team
                        ? 'Belum ada tiang yang ditugaskan ke tim ini.'
                        : `Belum ada ${unitLower} tercatat pada proyek ini.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            )}

            {/* Progres jumlah — mode per jumlah */}
            {isQuantity && (
              <>
                <table className="mt-4 w-full border-collapse text-[13px] text-neutral-800">
                  <thead>
                    <tr className="bg-neutral-100">
                      {['No', 'Tanggal', `Jumlah (${unitLower})`, 'Keterangan'].map((h) => (
                        <th
                          key={h}
                          className="border border-neutral-400 px-2 py-1.5 text-left font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quantityEntries.slice(0, 15).map((entry, i) => (
                      <tr key={entry.id ?? i}>
                        <td className="border border-neutral-400 px-2 py-1.5">{i + 1}</td>
                        <td className="border border-neutral-400 px-2 py-1.5">
                          {fmtDate(entry.recorded_at)}
                        </td>
                        <td className="border border-neutral-400 px-2 py-1.5">
                          {Number(entry.quantity_delta ?? 0).toLocaleString('id-ID')}
                        </td>
                        <td className="border border-neutral-400 px-2 py-1.5">
                          {entry.notes || '—'}
                        </td>
                      </tr>
                    ))}
                    {quantityEntries.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="border border-neutral-400 px-2 py-3 text-center text-neutral-500"
                        >
                          Belum ada catatan progres pada proyek ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {quantityEntries.length > 15 && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Menampilkan 15 catatan terakhir dari {quantityEntries.length} catatan.
                  </p>
                )}
              </>
            )}

            {/* Ringkasan progres */}
            <section className="mt-5 text-sm leading-relaxed text-neutral-800">
              <p className="font-semibold text-neutral-900">Ringkasan progres</p>
              {isQuantity ? (
                <ul className="mt-1 list-disc pl-6">
                  <li>
                    Target proyek: {targetDisplay.toLocaleString('id-ID')} {unitLower}.
                  </li>
                  <li>
                    Progres tercatat: {quantityTotal.toLocaleString('id-ID')} {unitLower} (
                    {fmtPct(quantityPct)}) dari {quantityEntries.length} catatan progres.
                  </li>
                </ul>
              ) : (
                <ul className="mt-1 list-disc pl-6">
                  <li>
                    {unitName} pada surat ini: {poles.length} dari {allPoleCount} {unitLower}{' '}
                    tercatat di proyek (target proyek {targetDisplay.toLocaleString('id-ID')}{' '}
                    {unitLower}).
                  </li>
                  <li>
                    Selesai 100%: {doneCount} {unitLower}.
                  </li>
                  <li>
                    Rata-rata progres {unitLower} pada surat ini: {fmtPct(avgProgress)}.
                  </li>
                </ul>
              )}
            </section>

            {/* Ketentuan */}
            <section className="mt-4 text-sm leading-relaxed text-neutral-800">
              <p className="font-semibold text-neutral-900">Ketentuan pelaksanaan</p>
              <ol className="mt-1 list-decimal pl-6">
                <li>
                  Pekerjaan dilaksanakan mengikuti daftar item pekerjaan dan standar proyek
                  yang berlaku.
                </li>
                <li>
                  Progres dan foto pelaksanaan dicatat di sistem pada hari yang sama agar
                  pemantauan berjalan akurat.
                </li>
                <li>
                  Kendala di lapangan dilaporkan kepada penanggung jawab proyek melalui
                  sistem agar segera ditindaklanjuti.
                </li>
              </ol>
            </section>

            {/* Tanda tangan */}
            <section className="mt-10 grid grid-cols-2 gap-8 text-sm text-neutral-800">
              <div>
                <p>Penerima Tugas,</p>
                <p className="text-neutral-600">
                  {team ? `Tim ${team.name}` : 'Tim Pelaksana Proyek'}
                </p>
                <div className="mt-20 border-b border-neutral-400" />
                <p className="mt-1 text-center text-neutral-500">( Nama jelas )</p>
              </div>
              <div>
                <p>{fmtDate(now.toISOString())}</p>
                <p className="text-neutral-600">Pemberi Tugas, Penanggung Jawab Proyek</p>
                <div className="mt-20 border-b border-neutral-400" />
                <p className="mt-1 text-center text-neutral-500">( Nama jelas )</p>
              </div>
            </section>

            <footer className="mt-10 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-400">
              Surat ini diterbitkan oleh{' '}
              {project.organization?.name ?? 'Tracking Pekerjaan'} melalui
              Tracking Pekerjaan (pjl.ituiot.com) pada{' '}
              {now.toLocaleString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              WIB. Nilai progres mengikuti catatan terakhir di sistem pada saat surat
              dicetak.
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
