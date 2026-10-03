import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Gauge,
  Map,
  MapPin,
  Menu,
  Milestone,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import './App.css'

const API_URL = '/api/projects/1'

const features = [
  {
    icon: Map,
    title: 'Peta Tiang',
    description:
      'Pantau seluruh titik tiang pada peta dan buka detail setiap lokasi dengan cepat.',
  },
  {
    icon: ClipboardCheck,
    title: 'Progress Pekerjaan',
    description:
      'Catat progress setiap item pekerjaan dari 0–100% dan hitung progress berbobot.',
  },
  {
    icon: TrendingUp,
    title: 'S-Curve',
    description:
      'Bandingkan rencana dan realisasi pekerjaan untuk melihat perkembangan proyek.',
  },
  {
    icon: Radio,
    title: 'Monitoring Lapangan',
    description:
      'Data lapangan terhubung ke dashboard sehingga perkembangan proyek lebih mudah dipantau.',
  },
]

function App() {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch(API_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Gagal mengambil data proyek')
        return response.json()
      })
      .then((data) => setProject(data.data))
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [])

  const targetPoles = project?.total_target_poles ?? 1500
  const projectName = project?.name ?? 'Tracking Tiang'
  const projectCode = project?.code ?? 'TT-DEMO-001'
  const status = project?.status ?? 'active'

  return (
    <main className="landing-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="navbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Milestone size={21} strokeWidth={2.4} />
          </span>
          <span>
            <strong>TRACKING</strong>
            <small>TIANG</small>
          </span>
        </a>

        <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
          <a href="#overview" onClick={() => setMenuOpen(false)}>
            Overview
          </a>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Fitur
          </a>
          <a href="#monitoring" onClick={() => setMenuOpen(false)}>
            Monitoring
          </a>
          <a href="/dashboard" className="nav-dashboard">
            Dashboard <ArrowRight size={15} />
          </a>
        </nav>

        <button
          className="mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <section id="overview" className="hero-section">
        <div className="hero-grid">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="live-dot" />
              <span>PROJECT MONITORING SYSTEM</span>
            </div>

            <h1>
              Pantau setiap
              <span> titik tiang.</span>
              <br />
              Kendalikan progres proyek.
            </h1>

            <p className="hero-description">
              Platform monitoring proyek untuk mengelola lokasi, progress
              pekerjaan, dan perkembangan lapangan dalam satu dashboard
              terintegrasi.
            </p>

            <div className="hero-actions">
              <a href="/dashboard" className="button-primary">
                Buka Dashboard
                <ArrowRight size={18} />
              </a>

              <a href="#features" className="button-secondary">
                Lihat Fitur
                <ChevronRight size={17} />
              </a>
            </div>

            <div className="hero-trust">
              <ShieldCheck size={17} />
              <span>Data proyek terpusat & mudah dipantau</span>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-glow" />

            <div className="project-card">
              <div className="project-card-header">
                <div>
                  <span className="label">PROJECT ACTIVE</span>
                  <h2>{projectName}</h2>
                  <p>{projectCode}</p>
                </div>

                <div className="status-badge">
                  <span />
                  {status === 'active' ? 'ACTIVE' : status.toUpperCase()}
                </div>
              </div>

              <div className="project-map">
                <div className="map-grid" />

                <div className="route route-one" />
                <div className="route route-two" />

                {[
                  ['pin-a', 'BDGL-001'],
                  ['pin-b', 'BDGL-002'],
                  ['pin-c', 'BDGL-003'],
                  ['pin-d', 'BDGL-004'],
                  ['pin-e', 'BDGL-005'],
                  ['pin-f', 'BDGL-006'],
                ].map(([className, code]) => (
                  <div key={code} className={`map-pin ${className}`}>
                    <MapPin size={15} />
                  </div>
                ))}

                <div className="map-center">
                  <CircleDot size={22} />
                </div>

                <div className="map-caption">
                  <MapPin size={14} />
                  Monitoring lokasi tiang
                </div>
              </div>

              <div className="project-stats">
                <div className="project-stat">
                  <span>Total Titik</span>
                  <strong>{loading ? '—' : targetPoles.toLocaleString('id-ID')}</strong>
                  <small>tiang</small>
                </div>

                <div className="project-stat">
                  <span>Progress</span>
                  <strong>19.08%</strong>
                  <small>realisasi</small>
                </div>

                <div className="project-stat">
                  <span>Status</span>
                  <strong className="online-text">Online</strong>
                  <small>monitoring</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="monitoring" className="overview-strip">
        <div className="strip-item">
          <div className="strip-icon">
            <Target size={20} />
          </div>
          <div>
            <strong>{loading ? '—' : targetPoles.toLocaleString('id-ID')}+</strong>
            <span>Titik Tiang</span>
          </div>
        </div>

        <div className="strip-divider" />

        <div className="strip-item">
          <div className="strip-icon">
            <Gauge size={20} />
          </div>
          <div>
            <strong>19.08%</strong>
            <span>Progress Aktif</span>
          </div>
        </div>

        <div className="strip-divider" />

        <div className="strip-item">
          <div className="strip-icon">
            <BarChart3 size={20} />
          </div>
          <div>
            <strong>8</strong>
            <span>Item Pekerjaan</span>
          </div>
        </div>

        <div className="strip-divider" />

        <div className="strip-item">
          <div className="strip-icon">
            <CalendarDays size={20} />
          </div>
          <div>
            <strong>9 Bulan</strong>
            <span>Rencana Proyek</span>
          </div>
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">SYSTEM CAPABILITIES</span>
            <h2>
              Semua informasi proyek,
              <br />
              <span>dalam satu tempat.</span>
            </h2>
          </div>

          <p>
            Tracking Tiang dirancang untuk membantu tim proyek melihat kondisi
            lapangan, mengukur progress, dan mengambil keputusan berdasarkan
            data yang terpusat.
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

                <a href="/dashboard">
                  Explore
                  <ArrowRight size={15} />
                </a>
              </article>
            )
          })}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-card">
          <div className="cta-icon">
            <Sparkles size={24} />
          </div>

          <div>
            <span className="section-kicker">PROJECT CONTROL</span>
            <h2>Mulai pantau progres proyek Anda.</h2>
            <p>
              Lihat lokasi tiang, progress pekerjaan, dan perkembangan proyek
              langsung dari dashboard.
            </p>
          </div>

          <a href="/dashboard" className="button-primary">
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

        <p>Project Monitoring System</p>

        <span className="footer-status">
          <span />
          System Ready
        </span>
      </footer>
    </main>
  )
}

export default App
