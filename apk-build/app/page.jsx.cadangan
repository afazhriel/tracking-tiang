'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  Layers,
  MapPin,
  Menu,
  Milestone,
  Radio,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'

import {
  getToken,
  normalizePole,
  normalizeProject,
  unwrapList,
} from '../lib/api'
import { formatNumber } from '../lib/format'
import { resolveStatus } from '../lib/status'
import './landing.css'

/* Leaflet hanya jalan di browser. Di-import lewat `dynamic`
   dengan `ssr:false` supaya tidak menyentuh `window` saat server
   merender HTML. */
const LandingPoleMap = dynamic(() => import('../components/landing/LandingPoleMap'), {
  ssr: false,
  loading: () => (
    <div className="map-skeleton" aria-hidden="true">
      <span className="map-skeleton-pulse" />
    </div>
  ),
})

/* Backend hanya mengekspos endpoint ini di belakang auth.sanctum, jadi
   landing tidak boleh mengarang project id. Tryout: ambil daftar
   project, pakai yang pertama, lalu baca tiang-nya.

   Landing tetap public: tanpa token kita berhenti sebelum request apa
   pun dan hanya bagian data yang jadi empty state. Kalau token ada, ia
   harus ikut dikirim sebagai Bearer — kalau tidak, Sanctum membalas 401
   dan peta kosong padahal user sudah login. */
const PROJECTS_URL = '/api/projects'
const POLES_URL = '/api/projects/{project}/poles'

function authHeaders(token) {
  const headers = { Accept: 'application/json' }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

const features = [
  {
    icon: MapPin,
    title: 'Peta Lokasi Tiang',
    description:
      'Setiap titik tiang tampil di peta dengan status masing-masing. Klik penanda untuk melihat kode, alamat, dan koordinat tanpa meninggalkan halaman.',
  },
  {
    icon: ClipboardCheck,
    title: 'Progres Pekerjaan',
    description:
      'Catat progres tiap item pekerjaan dari 0-100%. Progres keseluruhan dihitung otomatis dengan pembobotan, bukan rata-rata sederhana.',
  },
  {
    icon: TrendingUp,
    title: 'Kurva S',
    description:
      'Bandingkan kurva rencana dan realisasi dalam satu grafik. Selisih di antara keduanya menunjukkan proyek tertinggal atau melampaui target.',
  },
  {
    icon: Radio,
    title: 'Aktivitas Lapangan',
    description:
      'Catatan lapangan masuk ke dashboard yang sama, sehingga tim bisa melihat apa yang terjadi tanpa perlu bertanya ke lapangan.',
  },
]

export default function HomePage() {
  const [project, setProject] = useState(null)
  const [poles, setPoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [polesLoading, setPolesLoading] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /* Satu effect untuk project + tiang.
     Alasannya: `poles` butuh `project.id`. Dua effect terpisah akan
     menembak request tiang sebelum tahu project mana yang dipakai,
     dan itu memaksa kita mengarang id secara hardcoded. */
  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      /* Tanpa token, backend membalas 401 pada semua route di
         `routes/api.php`. Landing tetap harus tampil utuh — hanya
         bagian data yang diisi empty state. */
      const token = getToken()

      if (!token) {
        setProject(null)
        setPoles([])
        setMapFailed(true)
        setPolesLoading(false)
        setLoading(false)

        return
      }

      const headers = authHeaders(token)

      const projectsResponse = await fetch(PROJECTS_URL, {
        headers,
        signal: controller.signal,
      })

      if (!projectsResponse.ok) {
        throw new Error('Daftar project tidak dapat diakses')
      }

      const projects = unwrapList(await projectsResponse.json())

      if (!projects.length) {
        setProject(null)
        setPoles([])
        setMapFailed(false)
        setPolesLoading(false)
        setLoading(false)

        return
      }

      /* Project pertama yang tersedia — bukan id yang ditebak. */
      const active = projects[0]

      setProject(normalizeProject(active))

      const detailResponse = await fetch(`/api/projects/${active.id}`, {
        headers,
        signal: controller.signal,
      })

      if (detailResponse.ok) {
        const detail = await detailResponse.json()

        if (detail?.data) setProject(normalizeProject(detail.data))
      }

      const polesResponse = await fetch(POLES_URL.replace('{project}', active.id), {
        headers,
        signal: controller.signal,
      })

      if (!polesResponse.ok) throw new Error('Data tiang tidak dapat diakses')

      setPoles(unwrapList(await polesResponse.json()).map(normalizePole))
      setMapFailed(false)
    }

    load()
      .catch((error) => {
        if (error?.name === 'AbortError') return

        setProject(null)
        setPoles([])
        setMapFailed(true)
      })
      .finally(() => {
        setLoading(false)
        setPolesLoading(false)
      })

    return () => controller.abort()
  }, [])

  const locatedCount = useMemo(
    () => poles.filter((pole) => pole.hasCoordinate).length,
    [poles]
  )

  const targetPoles = project?.totalTargetPoles ?? null
  const projectName = project?.name ?? 'Proyek Monitoring Tiang'
  const projectCode = project?.code ?? null
  const projectStatus = resolveStatus(project?.status)
  const isActive = projectStatus.key === 'active' || projectStatus.key === 'done'

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <main className="landing-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <a className="skip-link" href="#hero">
        Lewati ke konten utama
      </a>

      <header className="navbar">
        <a className="brand" href="#hero">
          <span className="brand-mark">
            <Milestone size={21} strokeWidth={2.4} />
          </span>
          <span>
            <strong>TRACKING</strong>
            <small>TIANG</small>
          </span>
        </a>

        <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Navigasi utama">
          <a href="#peta" onClick={closeMenu}>
            Peta
          </a>
          <a href="#kapabilitas" onClick={closeMenu}>
            Kapabilitas
          </a>
          <a href="#ringkasan" onClick={closeMenu}>
            Ringkasan
          </a>
          <a href="/login" className="nav-dashboard">
            Masuk Dashboard <ArrowRight size={15} />
          </a>
        </nav>

        <button
          className="mobile-menu"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <section id="hero" className="hero-section">
        <div className="hero-grid">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="live-dot" />
              <span>Sistem Monitoring Proyek</span>
            </div>

            <h1>
              Setiap titik tiang,
              <span> selalu dalam pantauan.</span>
            </h1>

            <p className="hero-description">
              Satu dashboard untuk memetakan lokasi tiang, mencatat progres
              pekerjaan, dan membandingkan realisasi terhadap rencana. Tim
              proyek bekerja dari angka yang sama, dari tampilan yang sama.
            </p>

            <div className="hero-actions">
              <a href="/login" className="button-primary">
                Buka Dashboard
                <ArrowRight size={18} />
              </a>

              <a href="#peta" className="button-secondary">
                Lihat Peta Lokasi
                <ChevronRight size={17} />
              </a>
            </div>

            <div className="hero-trust">
              <ShieldCheck size={17} />
              <span>Data proyek terpusat dan dapat diaudit</span>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-glow" />

            <div className="project-card">
              <div className="project-card-header">
                <div>
                  <span className="label">PROYEK AKTIF</span>
                  <h2>{loading ? 'Memuat data proyek...' : projectName}</h2>
                  {projectCode && <p>{projectCode}</p>}
                </div>

                <div className={isActive ? 'status-badge' : 'status-badge muted'}>
                  <span />
                  {loading ? 'Memuat' : isActive ? 'Aktif' : 'Tidak aktif'}
                </div>
              </div>

              <div className="project-map">
                {polesLoading ? (
                  <div className="map-skeleton">
                    <span className="map-skeleton-pulse" />
                    <span className="map-skeleton-label">Memuat peta lokasi...</span>
                  </div>
                ) : locatedCount > 0 ? (
                  <>
                    <LandingPoleMap poles={poles} />
                    <div className="map-overlay-top">
                      <Layers size={13} />
                      <span>
                        {formatNumber(locatedCount)} titik terpetakan
                      </span>
                    </div>
                    <div className="map-overlay-hint">Klik penanda untuk detail</div>
                  </>
                ) : (
                  <div className="map-empty">
                    <MapPin size={20} />
                    <p className="map-empty-title">
                      {mapFailed ? 'Peta belum dapat dimuat' : 'Belum ada koordinat tiang'}
                    </p>
                    <p className="map-empty-body">
                      {mapFailed
                        ? 'Data lokasi tidak dapat diambil saat ini. Numeric lain tetap dapat Anda pantau.'
                        : 'Tiang pada proyek ini belum memiliki latitude dan longitude, jadi belum tampil di peta.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="project-stats">
                <div className="project-stat">
                  <span>Target Tiang</span>
                  <strong>
                    {loading ? '—' : formatNumber(targetPoles)}
                  </strong>
                  <small>target proyek</small>
                </div>

                <div className="project-stat">
                  <span>Titik Terpetakan</span>
                  <strong>
                    {polesLoading ? '—' : formatNumber(locatedCount)}
                  </strong>
                  <small>punya koordinat</small>
                </div>

                <div className="project-stat">
                  <span>Status Proyek</span>
                  <strong className={isActive ? 'online-text' : 'muted-text'}>
                    {loading ? '—' : isActive ? 'Aktif' : 'Idle'}
                  </strong>
                  <small>monitoring</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="ringkasan" className="overview-strip" aria-label="Ringkasan proyek">
        <div className="strip-item">
          <div className="strip-icon">
            <Target size={20} />
          </div>
          <div>
            <strong>{loading ? '—' : formatNumber(targetPoles)}</strong>
            <span>Target Tiang</span>
          </div>
        </div>

        <div className="strip-divider" />

        <div className="strip-item">
          <div className="strip-icon">
            <MapPin size={20} />
          </div>
          <div>
            <strong>{polesLoading ? '—' : formatNumber(locatedCount)}</strong>
            <span>Lokasi Terpetakan</span>
          </div>
        </div>

        <div className="strip-item">
          <div className="strip-icon">
            <BarChart3 size={20} />
          </div>
          <div>
            <strong>4</strong>
            <span>Modul Monitoring</span>
          </div>
        </div>

        <div className="strip-item">
          <div className="strip-icon">
            <CalendarDays size={20} />
          </div>
          <div>
            <strong>24/7</strong>
            <span>Akses Monitoring</span>
          </div>
        </div>
      </section>

      <section id="peta" className="map-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Peta Lokasi</span>
            <h2>
              Lihat Titik Tiang
              <br />
              <span>secara geografis.</span>
            </h2>
          </div>

          <p>
            Peta menampilkan koordinat tiang yang sudah tercatat. Warna penanda
            mengikuti status masing-masing, sehingga titik yang butuh perhatian
            langsung terlihat tanpa membuka daftar.
          </p>
        </div>

        <div className="map-wide">
          {polesLoading ? (
            <div className="map-skeleton">
              <span className="map-skeleton-pulse" />
              <span className="map-skeleton-label">Memuat peta lokasi...</span>
            </div>
          ) : locatedCount > 0 ? (
            <>
              <LandingPoleMap poles={poles} />
              <div className="map-overlay-top">
                <Layers size={13} />
                <span>{formatNumber(locatedCount)} titik terpetakan</span>
              </div>
              <div className="map-overlay-hint">Klik penanda untuk detail</div>
            </>
          ) : (
            <div className="map-empty">
              <MapPin size={20} />
              <p className="map-empty-title">
                {mapFailed ? 'Peta belum dapat dimuat' : 'Belum ada koordinat tiang'}
              </p>
              <p className="map-empty-body">
                {mapFailed
                  ? 'Data lokasi tidak dapat diambil saat ini.'
                  : 'Tiang pada proyek ini belum memiliki latitude dan longitude.'}
              </p>
            </div>
          )}
        </div>

        <ul className="map-legend">
          {[
            ['Selesai', '#5f8a50'],
            ['Berjalan', '#36778a'],
            ['Tertunda', '#c88e33'],
            ['Perlu perhatian', '#d3574c'],
          ].map(([label, color]) => (
            <li key={label}>
              <span className="map-legend-dot" style={{ backgroundColor: color }} />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section id="kapabilitas" className="features-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Kapabilitas</span>
            <h2>
              Yang bisa dikerjakan
              <br />
              <span>seluruh tim.</span>
            </h2>
          </div>

          <p>
            Empat modul yang saling terhubung. Satu perubahan di lapangan langsung
            terbaca di peta, di angka progres, dan di kurva S — tanpa input ulang di
            tempat lain.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((feature, index) => {
            const Icon = feature.icon

            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-number">0{index + 1}</div>

                <div className="feature-icon">
                  <Icon size={22} />
                </div>

                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-card">
          <div className="cta-icon">
            <Gauge size={24} />
          </div>

          <div>
            <span className="section-kicker">Langkah Selanjutnya</span>
            <h2>Mulai pantau progres proyek Anda.</h2>
            <p>
              Buka dashboard untuk melihat seluruh titik tiang, progres pekerjaan,
              dan kurva S dalam satu tampilan.
            </p>
          </div>

          <a href="/login" className="button-primary">
            Masuk Dashboard
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="brand">
          <span className="brand-mark">
            <Milestone size={18} />
          </span>
          <span>
            <strong>TRACKING</strong>
            <small>TIANG</small>
          </span>
        </div>

        <p>Sistem Monitoring Proyek Tegangan</p>

        <span className="footer-status">
          <span />
          Sistem aktif
        </span>
      </footer>
    </main>
  )
}