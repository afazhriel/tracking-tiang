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

import { normalizePole, unwrapList } from '../lib/api'
import { formatNumber } from '../lib/format'
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

const API_URL = '/api/projects/1'
const POLES_URL = '/api/projects/1/poles'

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
  const [mapLoading, setMapLoading] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch(API_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Gagal mengambil data proyek')

        return response.json()
      })
      .then((data) => setProject(data?.data ?? null))
      .catch((error) => {
        if (error?.name === 'AbortError') return

        setProject(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  /* Peta dibangun dari data tiang asli. Kalau endpoint tidak
     tersedia atau gagal, komponen di bawah tetap tampil dengan
     angka yang tersedia — tidak ada pin karangan. */
  useEffect(() => {
    const controller = new AbortController()

    fetch(POLES_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Gagal mengambil data tiang')

        return response.json()
      })
      .then((payload) => setPoles(unwrapList(payload).map(normalizePole)))
      .catch((error) => {
        if (error?.name === 'AbortError') return

        setPoles([])
        setMapFailed(true)
      })
      .finally(() => setMapLoading(false))

    return () => controller.abort()
  }, [])

  const locatedCount = useMemo(
    () => poles.filter((pole) => pole.hasCoordinate).length,
    [poles]
  )

  const targetPoles = project?.total_target_poles ?? 0
  const projectName = project?.name ?? 'Proyek Monitoring Tiang'
  const projectCode = project?.code ?? null
  const isActive = project?.status === 'active'

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
                {mapLoading ? (
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
                    {mapLoading ? '—' : formatNumber(locatedCount)}
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
            <strong>{mapLoading ? '—' : formatNumber(locatedCount)}</strong>
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
          {mapLoading ? (
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