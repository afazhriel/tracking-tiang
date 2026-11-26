'use client'

import Sidebar from '../../src/components/Sidebar'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {

  Activity,

  BarChart3,

  CalendarRange,

  CheckCircle2,

  Crosshair,

  Layers,

  ListChecks,

  Loader2,

  MapPin,

  MousePointerClick,

  RefreshCw,

  Save,

  Target,

  TrendingUp,

  X,

} from 'lucide-react'

import {

  MapContainer,

  Marker,

  Popup,

  TileLayer,

  useMap,

} from 'react-leaflet'

import {

  CartesianGrid,

  Line,

  LineChart,

  ResponsiveContainer,

  Tooltip,

  XAxis,

  YAxis,

} from 'recharts'

import L from 'leaflet'

import 'leaflet/dist/leaflet.css'

const PROJECT_ID = 1

const NAV_W = 252

const NAV_W_COLLAPSED = 76

const SECTIONS = [

  'dashboard',

  'tiang',

  'pekerjaan',

  'kurva-s',

  'aktivitas',

]

const CHART_COLORS = {

  planned: '#5a90d6',

  actual: '#e9a13c',

}

const markerIcon = new L.Icon({

  iconUrl:

    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',

  iconRetinaUrl:

    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',

  shadowUrl:

    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',

  iconSize: [25, 41],

  iconAnchor: [12, 41],

  popupAnchor: [1, -34],

})

function formatDate(value, options) {

  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('id-ID', options)

}

const shortDate = { day: '2-digit', month: 'short', year: 'numeric' }

const dayMonth = { day: '2-digit', month: 'short' }

function percent(value) {

  return `${Number(value || 0).toFixed(2)}%`

}

function FitMap({ poles }) {

  const map = useMap()

  useEffect(() => {

    if (!poles.length) return

    const points = poles.map((pole) => [

      Number(pole.latitude),

      Number(pole.longitude),

    ])

    if (points.length === 1) {

      map.setView(points[0], 15)

      return

    }

    map.fitBounds(points, {

      padding: [45, 45],

    })

  }, [poles, map])

  return null

}

function CurveTooltip({ active, payload, label }) {

  if (!active || !payload?.length) return null

  return (

    <div className="pcr-recharts-tooltip">

      <div className="pcr-recharts-tooltip__label">{label}</div>

      {payload.map((entry) => (

        <div

          className="pcr-recharts-tooltip__row"

          key={entry.dataKey}

        >

          <em>

            <i

              style={{

                background:

                  CHART_COLORS[entry.dataKey] ?? '#5a90d6',

              }}

            />

            {entry.dataKey === 'planned' ? 'Rencana' : 'Aktual'}

          </em>

          <b>{percent(entry.value)}</b>

        </div>

      ))}

    </div>

  )

}

export default function Dashboard() {

  const [project, setProject] = useState(null)

  const [poles, setPoles] = useState([])

  const [curve, setCurve] = useState(null)

  const [selectedPole, setSelectedPole] = useState(null)

  const [poleProgress, setPoleProgress] = useState([])

  const [selectedWorkItemId, setSelectedWorkItemId] = useState('')

  const [progressInput, setProgressInput] = useState('')

  const [progressNotes, setProgressNotes] = useState('')

  const [savingProgress, setSavingProgress] = useState(false)

  const [progressMessage, setProgressMessage] = useState('')

  const [progressTone, setProgressTone] = useState('info')

  const [loading, setLoading] = useState(true)

  const [refreshing, setRefreshing] = useState(false)

  const [navCollapsed, setNavCollapsed] = useState(true)

  const [mobileOpen, setMobileOpen] = useState(false)

  const [activeSection, setActiveSection] = useState('dashboard')

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {

    if (silent) setRefreshing(true)

    else setLoading(true)

    try {

      const token = localStorage.getItem('tracking_tiang_token')

      const [projectResponse, polesResponse, curveResponse] =

        await Promise.all([

          fetch(`/api/projects/${PROJECT_ID}`, { headers: { Authorization: `Bearer ${token}` } }),

          fetch(`/api/projects/${PROJECT_ID}/poles`, { headers: { Authorization: `Bearer ${token}` } }),

          fetch(`/api/projects/${PROJECT_ID}/curve`, { headers: { Authorization: `Bearer ${token}` } }),

        ])

      const projectJson = await projectResponse.json()

      const polesJson = await polesResponse.json()

      const curveJson = await curveResponse.json()

      setProject(projectJson.data)

      setPoles(polesJson.data || [])

      setCurve(curveJson)

    } catch (error) {

      console.error('Dashboard gagal memuat data:', error)

    } finally {

      setLoading(false)

      setRefreshing(false)

    }

  }, [])

  useEffect(() => {

    loadDashboard()

  }, [loadDashboard])

  useEffect(() => {

    function syncNav() {

      if (window.innerWidth < 1180) setNavCollapsed(true)

    }

    function syncSection() {

      const line = 150

      let current = SECTIONS[0]

      SECTIONS.forEach((id) => {

        const element = document.getElementById(id)

        if (element && element.getBoundingClientRect().top - line <= 0) {

          current = id

        }

      })

      setActiveSection(current)

    }

    syncNav()

    syncSection()

    window.addEventListener('resize', syncNav)

    window.addEventListener('resize', syncSection)

    window.addEventListener('scroll', syncSection, { passive: true })

    return () => {

      window.removeEventListener('resize', syncNav)

      window.removeEventListener('resize', syncSection)

      window.removeEventListener('scroll', syncSection)

    }

  }, [])

  useEffect(() => {

    if (!selectedPole) {

      setPoleProgress([])

      setSelectedWorkItemId('')

      return

    }

    async function loadPoleProgress() {

      try {

        const token = localStorage.getItem('tracking_tiang_token')

        const response = await fetch(

          `/api/projects/${PROJECT_ID}/poles/${selectedPole.id}/progress`,

          { headers: { Authorization: `Bearer ${token}` } },

        )

        const json = await response.json()

        setPoleProgress(json.data || [])

      } catch (error) {

        console.error('Progress tiang gagal dimuat:', error)

        setPoleProgress([])

      }

    }

    loadPoleProgress()

  }, [selectedPole])

  const projectProgress =

    curve?.actual_current_percent ??

    0

  const handleWorkItemChange = (event) => {

    const workItemId = event.target.value

    setSelectedWorkItemId(workItemId)

    setProgressMessage('')

    const existing = poleProgress.find(

      (item) => String(item.work_item_id) === String(workItemId),

    )

    setProgressInput(

      existing ? String(Number(existing.progress_percent)) : '0',

    )

    setProgressNotes(existing?.notes || '')

  }

  const handleSaveProgress = async (event) => {

    event.preventDefault()

    if (!selectedPole || !selectedWorkItemId) {

      setProgressTone('error')

      setProgressMessage('Pilih pekerjaan terlebih dahulu.')

      return

    }

    const value = Number(progressInput)

    if (!Number.isFinite(value) || value < 0 || value > 100) {

      setProgressTone('error')

      setProgressMessage('Progress harus berada di antara 0 sampai 100%.')

      return

    }

    setSavingProgress(true)

    setProgressTone('info')

    setProgressMessage('Menyimpan progress...')

    try {

      const response = await fetch(

        `/api/projects/${PROJECT_ID}/poles/${selectedPole.id}/progress`,

        {

          method: 'POST',

          headers: {

            'Content-Type': 'application/json',

            Accept: 'application/json',

          },

          body: JSON.stringify({

            work_item_id: Number(selectedWorkItemId),

            progress_percent: value,

            notes: progressNotes || null,

          }),

        },

      )

      const json = await response.json()

      if (!response.ok) {

        const firstError = json.errors

          ? Object.values(json.errors).flat()[0]

          : json.message

        throw new Error(

          firstError || 'Progress gagal disimpan.',

        )

      }

      setPoleProgress((current) => {

        const updated = {

          ...(current.find(

            (item) =>

              item.work_item_id === Number(selectedWorkItemId),

          ) || {}),

          ...(json.data || {}),

        }

        const exists = current.some(

          (item) =>

            item.work_item_id === Number(selectedWorkItemId),

        )

        if (exists) {

          return current.map((item) =>

            item.work_item_id === Number(selectedWorkItemId)

              ? updated

              : item,

          )

        }

        return [...current, updated]

      })

      setProgressTone('info')

      setProgressMessage(

        json.message || 'Progress berhasil disimpan.',

      )

      setProgressNotes('')

    } catch (error) {

      console.error('Gagal menyimpan progress:', error)

      setProgressTone('error')

      setProgressMessage(error.message)

    } finally {

      setSavingProgress(false)

    }

  }

  const handleSelectPole = useCallback((pole) => {

    setSelectedPole(pole)

    setProgressMessage('')

  }, [])

  const workItems = project?.work_items || []

  const workItemCount = workItems.length

  const targetPoles = project?.total_target_poles ?? 0

  const recordedRatio = targetPoles

    ? (poles.length / targetPoles) * 100

    : 0

  const projectStatus = (project?.status ?? 'active').toUpperCase()

  const selectedPoleProgress = useMemo(() => {

    if (!selectedPole || !project?.work_items) return 0

    return project.work_items.reduce((total, workItem) => {

      const progress = poleProgress.find(

        (item) => item.work_item_id === workItem.id,

      )

      const currentProgress = Number(

        progress?.progress_percent ?? 0,

      )

      return (

        total +

        (Number(workItem.weight_percent) * currentProgress) / 100

      )

    }, 0)

  }, [selectedPole, project, poleProgress])

  const mapCenter = useMemo(() => {

    if (!poles.length) return [-6.917464, 107.619123]

    return [

      Number(poles[0].latitude),

      Number(poles[0].longitude),

    ]

  }, [poles])

  const curveData = useMemo(() => {

    if (!curve) return []

    const planned = curve.planned_curve || []

    const actual = curve.actual_curve || []

    const rows = planned.map((item) => ({

      date: item.date,

      label: formatDate(item.date, shortDate),

      planned: Number(item.cumulative_percent || 0),

      actual: null,

    }))

    actual.forEach((item) => {

      const existing = rows.find((row) => row.date === item.date)

      if (existing) {

        existing.actual = Number(item.progress_percent || 0)

      } else {

        rows.push({

          date: item.date,

          label: formatDate(item.date, shortDate),

          planned: null,

          actual: Number(item.progress_percent || 0),

        })

      }

    })

    return rows.sort((a, b) => a.date.localeCompare(b.date))

  }, [curve])

  const activityFeed = useMemo(() => {

    const actual = curve?.actual_curve || []

    return [...actual]

      .sort((a, b) => String(b.date).localeCompare(String(a.date)))

      .slice(0, 7)

  }, [curve])

  return (

    <div

      className="pcr"

      data-nav={navCollapsed ? 'collapsed' : 'open'}

      style={{ '--nav-w': `${navCollapsed ? NAV_W_COLLAPSED : NAV_W}px` }}

    >

      <Sidebar

        navCollapsed={navCollapsed}

        onToggleNav={() => setNavCollapsed((value) => !value)}

        mobileOpen={mobileOpen}

        onToggleMobile={setMobileOpen}

        activeSection={activeSection}

      />

      <div className="pcr-main">

        <header className="pcr-topbar" id="dashboard">

          <div className="pcr-topbar-main">

            <div className="pcr-crumbs">

              Project Control Room

              <span aria-hidden="true">/</span>

              <em>{project?.code ?? 'TT-001'}</em>

            </div>

            <div className="pcr-topbar-title">

              <h1>{project?.name ?? 'Tracking Tiang'}</h1>

              <span className="pcr-code">{project?.code ?? 'TT-001'}</span>

            </div>

            <div className="pcr-topbar-meta">

              <span className="pcr-chip pcr-chip--status">

                <i />

                Project {projectStatus}

              </span>

              <span className="pcr-chip">

                <CalendarRange size={12} />

                {formatDate(project?.start_date, shortDate)}

                {' — '}

                {formatDate(project?.end_date, shortDate)}

              </span>

              <span className="pcr-chip">

                <MapPin size={12} />

                {poles.length.toLocaleString('id-ID')} /{' '}

                {targetPoles.toLocaleString('id-ID')} titik

              </span>

            </div>

          </div>

          <button

            type="button"

            className="pcr-ghostbtn"

            onClick={() => loadDashboard({ silent: true })}

            disabled={refreshing}

          >

            <RefreshCw

              size={14}

              className={refreshing ? 'pcr-spin' : undefined}

            />

            {refreshing ? 'Memuat...' : 'Refresh data'}

          </button>

        </header>

        <main className="pcr-content">

          <section className="pcr-kpis">

            <article

              className="pcr-kpi pcr-kpi--lead"

              data-accent="cyan"

            >

              <div className="pcr-kpi-top">

                <span className="pcr-kpi-label">Progress Proyek</span>

                <span className="pcr-kpi-icon">

                  <TrendingUp size={15} strokeWidth={2} />

                </span>

              </div>

              {loading ? (

                <span

                  className="pcr-kpi-value"

                  style={{ color: 'transparent' }}

                >

                  00.00%

                </span>

              ) : (

                <strong className="pcr-kpi-value">

                  {projectProgress.toFixed(2)}%

                </strong>

              )}

              <div className="pcr-bar" data-tone="cyan">

                <span

                  style={{

                    width: `${Math.min(projectProgress, 100)}%`,

                  }}

                />

              </div>

              <span className="pcr-kpi-sub">

                Realisasi aktual kumulatif · target 100%

              </span>

            </article>

            <article className="pcr-kpi" data-accent="cyan">

              <div className="pcr-kpi-top">

                <span className="pcr-kpi-label">Total Target Tiang</span>

                <span className="pcr-kpi-icon">

                  <Target size={15} strokeWidth={2} />

                </span>

              </div>

              <strong className="pcr-kpi-value">

                {loading ? '—' : targetPoles.toLocaleString('id-ID')}

              </strong>

              <span className="pcr-kpi-sub">Target proyek</span>

            </article>

            <article className="pcr-kpi" data-accent="amber">

              <div className="pcr-kpi-top">

                <span className="pcr-kpi-label">Titik Terdata</span>

                <span className="pcr-kpi-icon">

                  <MapPin size={15} strokeWidth={2} />

                </span>

              </div>

              <strong className="pcr-kpi-value">

                {loading ? '—' : poles.length.toLocaleString('id-ID')}

              </strong>

              <div className="pcr-bar" data-tone="amber">

                <span

                  style={{

                    width: `${Math.min(recordedRatio, 100)}%`,

                  }}

                />

              </div>

              <span className="pcr-kpi-sub">

                {recordedRatio.toFixed(1)}% dari target

              </span>

            </article>

            <article className="pcr-kpi" data-accent="blue">

              <div className="pcr-kpi-top">

                <span className="pcr-kpi-label">Item Pekerjaan</span>

                <span className="pcr-kpi-icon">

                  <ListChecks size={15} strokeWidth={2} />

                </span>

              </div>

              <strong className="pcr-kpi-value">{workItemCount}</strong>

              <span className="pcr-kpi-sub">Work item terdaftar</span>

            </article>

            <article className="pcr-kpi" data-accent="green">

              <div className="pcr-kpi-top">

                <span className="pcr-kpi-label">Status Proyek</span>

                <span className="pcr-kpi-icon">

                  <Activity size={15} strokeWidth={2} />

                </span>

              </div>

              <strong className="pcr-kpi-value">

                {project?.status === 'active' ? 'ACTIVE' : projectStatus}

              </strong>

              <span className="pcr-kpi-sub">

                Periode {formatDate(project?.start_date, dayMonth)}

                {' - '}

                {formatDate(project?.end_date, shortDate)}

              </span>

            </article>

          </section>

          <section className="pcr-grid-main" id="tiang">

            <div className="pcr-panel">

              <div className="pcr-panel-head">

                <div className="pcr-panel-title">

                  <span className="pcr-panel-kicker">Live Location</span>

                  <h2>Peta Lokasi Tiang</h2>

                </div>

                <span className="pcr-chip">

                  <Crosshair size={12} />

                  {poles.length.toLocaleString('id-ID')} titik

                </span>

              </div>

              <div className="pcr-map-body">

                <MapContainer

                  center={mapCenter}

                  zoom={13}

                  scrollWheelZoom

                  className="pcr-map"

                >

                  <TileLayer

                    attribution='&copy; OpenStreetMap contributors'

                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

                  />

                  <FitMap poles={poles} />

                  {poles.map((pole) => (

                    <Marker

                      key={pole.id}

                      position={[
                        Number(pole.latitude),
                        Number(pole.longitude),
                      ]}

                      icon={markerIcon}

                      eventHandlers={{
                        click: () => handleSelectPole(pole),
                      }}

                    >

                      <Popup>

                        <div className="pcr-popup">

                          <strong>{pole.pole_code}</strong>

                          <span>

                            {pole.address || 'Alamat belum tersedia'}

                          </span>

                          <small>

                            Status: {pole.status}

                          </small>

                        </div>

                      </Popup>

                    </Marker>

                  ))}

                </MapContainer>

                {!loading && poles.length === 0 && (

                  <div className="pcr-map-empty">

                    <MapPin size={24} strokeWidth={1.6} />

                    <strong>Belum ada titik tiang</strong>

                    <span>

                      Data lokasi akan muncul setelah titik proyek

                      tersedia.

                    </span>

                  </div>

                )}

                {poles.length > 0 && (

                  <div className="pcr-map-legend">

                    <span>

                      <i style={{ background: CHART_COLORS.actual }} />

                      Klik marker untuk detail tiang
                    </span>

                    <span>

                      <i style={{ background: CHART_COLORS.planned }} />

                      {poles.length} titik terdata
                    </span>

                  </div>

                )}

              </div>

            </div>

            <aside className="pcr-panel pcr-detail">

              <div className="pcr-section">

                <div className="pcr-section-head">

                  <h4>Ringkasan Proyek</h4>

                  <span className="pcr-tag">{projectStatus}</span>

                </div>

                <div className="pcr-bar" data-tone="cyan">

                  <span

                    style={{

                      width: `${Math.min(projectProgress, 100)}%`,

                    }}

                  />

                </div>

                <div className="pcr-facts" style={{ border: 0, marginTop: 12 }}>

                  <div className="pcr-fact">

                    <span>Target</span>

                    <strong>

                      {targetPoles.toLocaleString('id-ID')} tiang

                    </strong>

                  </div>

                  <div className="pcr-fact">

                    <span>Terdata</span>

                    <strong>

                      {poles.length.toLocaleString('id-ID')} titik

                    </strong>

                  </div>

                  <div className="pcr-fact pcr-fact--wide">

                    <span>Periode Proyek</span>

                    <strong>

                      {formatDate(project?.start_date, shortDate)}

                      {' — '}

                      {formatDate(project?.end_date, shortDate)}

                    </strong>

                  </div>

                </div>

              </div>

              {!selectedPole ? (

                <div className="pcr-empty">

                  <span className="pcr-empty-icon">

                    <MousePointerClick size={20} strokeWidth={1.7} />

                  </span>

                  <strong>Tidak ada tiang dipilih</strong>

                  <p>Klik marker pada peta untuk melihat detail.</p>

                </div>

              ) : (

                <>

                  <div className="pcr-detail-head">

                    <div>

                      <h3>{selectedPole.pole_code}</h3>

                      <p>

                        {selectedPole.address ||

                          'Alamat belum tersedia'}

                      </p>

                    </div>

                    <span className="pcr-tag pcr-tag--amber">

                      {(selectedPole.status || 'active').toUpperCase()}

                    </span>

                    <button

                      type="button"

                      className="pcr-closebtn"

                      onClick={() => setSelectedPole(null)}

                      aria-label="Tutup detail tiang"

                    >

                      <X size={14} />

                    </button>

                  </div>

                  <div className="pcr-facts">

                    <div className="pcr-fact pcr-fact--wide">

                      <span>Alamat</span>

                      <strong>

                        {selectedPole.address ||

                          'Alamat belum tersedia'}

                      </strong>

                    </div>

                    <div className="pcr-fact">

                      <span>Latitude</span>

                      <strong>

                        {Number(selectedPole.latitude).toFixed(6)}

                      </strong>

                    </div>

                    <div className="pcr-fact">

                      <span>Longitude</span>

                      <strong>

                        {Number(selectedPole.longitude).toFixed(6)}

                      </strong>

                    </div>

                  </div>

                  <div className="pcr-section">

                    <div className="pcr-section-head">

                      <h4>Progress Tiang</h4>

                      <strong>{selectedPoleProgress.toFixed(2)}%</strong>

                    </div>

                    <div className="pcr-bar" data-tone="cyan">

                      <span

                        style={{

                          width: `${Math.min(selectedPoleProgress, 100)}%`,

                        }}

                      />

                    </div>

                  </div>

                  <div className="pcr-section">

                    <div className="pcr-section-head">

                      <h4>Rincian Pekerjaan</h4>

                      <strong style={{ color: 'var(--c-text-3)' }}>

                        {workItemCount} item

                      </strong>

                    </div>

                    <div className="pcr-mini-list">

                      {workItems.map((workItem) => {

                        const progress = poleProgress.find(

                          (item) =>

                            item.work_item_id === workItem.id,

                        )

                        const value = Number(

                          progress?.progress_percent ?? 0,

                        )

                        return (

                          <div

                            className="pcr-mini"

                            key={workItem.id}

                          >

                            <div className="pcr-mini-info">

                              <strong>{workItem.name}</strong>

                              <span>

                                Bobot {workItem.weight_percent}%

                              </span>

                            </div>

                            <div className="pcr-mini-right">

                              <b>{value.toFixed(0)}%</b>

                              <div

                                className="pcr-bar"

                                data-tone={value >= 100 ? 'green' : 'cyan'}

                                style={{ marginTop: 5 }}

                              >

                                <span

                                  style={{

                                    width: `${Math.min(value, 100)}%`,

                                  }}

                                />

                              </div>

                            </div>

                          </div>

                        )

                      })}

                    </div>

                  </div>

                  <div className="pcr-section">

                    <div className="pcr-section-head">

                      <h4>Update Progress</h4>

                    </div>

                    <form

                      className="pcr-form"

                      onSubmit={handleSaveProgress}

                    >

                      <div className="pcr-field">

                        <label htmlFor="pcr-work-item">

                          Pekerjaan

                        </label>

                        <select

                          id="pcr-work-item"

                          value={selectedWorkItemId}

                          onChange={handleWorkItemChange}

                        >

                          <option value="">

                            Pilih pekerjaan...

                          </option>

                          {workItems.map((workItem) => (

                            <option

                              key={workItem.id}

                              value={workItem.id}

                            >

                              {workItem.sequence}. {workItem.name}

                            </option>

                          ))}

                        </select>

                      </div>

                      <div className="pcr-field-row">

                        <div className="pcr-field">

                          <label htmlFor="pcr-progress">

                            Progress (%)

                          </label>

                          <input

                            id="pcr-progress"

                            type="number"

                            min="0"

                            max="100"

                            step="0.01"

                            inputMode="decimal"

                            value={progressInput}

                            onChange={(event) =>

                              setProgressInput(event.target.value)

                            }

                            placeholder="0 - 100"

                          />

                        </div>

                        <div className="pcr-field">

                          <label htmlFor="pcr-notes">

                            Catatan

                          </label>

                          <input

                            id="pcr-notes"

                            value={progressNotes}

                            onChange={(event) =>

                              setProgressNotes(event.target.value)

                            }

                            placeholder="Opsional"

                          />

                        </div>

                      </div>

                      <button

                        type="submit"

                        className="pcr-submit"

                        disabled={savingProgress || !selectedWorkItemId}

                      >

                        {savingProgress ? (

                          <Loader2 size={14} className="pcr-spin" />

                        ) : (

                          <Save size={14} />

                        )}

                        {savingProgress ? 'Menyimpan...' : 'Simpan Progress'}

                      </button>

                      {progressMessage && (

                        <div

                          className={`pcr-alert pcr-alert--${progressTone}`}

                        >

                          {progressMessage}

                        </div>

                      )}

                    </form>

                  </div>

                </>

              )}

            </aside>

          </section>

          <section className="pcr-panel" id="pekerjaan">

            <div className="pcr-panel-head">

              <div className="pcr-panel-title">

                <span className="pcr-panel-kicker">

                  Work Breakdown

                </span>

                <h2>Progress Item Pekerjaan</h2>

                <p className="pcr-panel-note">

                  {selectedPole

                    ? `Realisasi per item pada tiang ${selectedPole.pole_code}.`

                    : 'Bobot progress tiap item pekerjaan pada proyek.'}

                </p>

              </div>

              <span className="pcr-chip">

                <Layers size={12} />

                {workItemCount} item · bobot 100%

              </span>

            </div>

            <div className="pcr-panel-body">

              <div className="pcr-work-list">

                {workItems.map((workItem) => {

                  const progress = selectedPole

                    ? poleProgress.find(

                      (item) => item.work_item_id === workItem.id,

                    )

                    : null

                  const value = Number(progress?.progress_percent ?? 0)

                  const contribution = (

                    (Number(workItem.weight_percent) * value) / 100

                  )

                  return (

                    <div

                      className="pcr-work-row"

                      key={workItem.id}

                    >

                      <span className="pcr-work-seq">

                        {workItem.sequence}

                      </span>

                      <div className="pcr-work-name">

                        <strong>{workItem.name}</strong>

                        <span>

                          Bobot {workItem.weight_percent}%

                        </span>

                      </div>

                      <div>

                        <div className="pcr-work-num">

                          <b>{value.toFixed(0)}%</b>

                          <i>

                            kontribusi {contribution.toFixed(2)}%

                          </i>

                        </div>

                        <div

                          className="pcr-bar"

                          data-tone={

                            value >= 100

                              ? 'green'

                              : value > 0

                                ? 'cyan'

                                : 'slate'

                          }

                        >

                          <span

                            style={{

                              width: `${Math.min(value, 100)}%`,

                            }}

                          />

                        </div>

                      </div>

                    </div>

                  )

                })}

              </div>

            </div>

          </section>

          <section className="pcr-panel" id="kurva-s">

            <div className="pcr-panel-head">

              <div className="pcr-panel-title">

                <span className="pcr-panel-kicker">

                  Project Performance

                </span>

                <h2>S-Curve Progress</h2>

                <p className="pcr-panel-note">

                  Perbandingan rencana vs aktual kumulatif

                </p>

              </div>

              <div className="pcr-curve-legend">

                <span>

                  <i style={{ background: CHART_COLORS.planned }} />

                  Rencana

                </span>

                <span>

                  <i style={{ background: CHART_COLORS.actual }} />

                  Aktual

                </span>

              </div>

            </div>

            <div className="pcr-curve-body">

              {curveData.length ? (

                <ResponsiveContainer

                  width="100%"

                  height="100%"

                >

                  <LineChart

                    data={curveData}

                    margin={{

                      top: 12,

                      right: 18,

                      left: 0,

                      bottom: 6,

                    }}

                  >

                    <CartesianGrid

                      stroke="rgba(164,182,201,0.10)"

                      vertical={false}

                    />

                    <XAxis

                      dataKey="label"

                      tick={{ fill: '#7a90a6', fontSize: 10 }}

                      axisLine={{ stroke: 'rgba(164,182,201,0.16)' }}

                      tickLine={false}

                      minTickGap={18}

                    />

                    <YAxis

                      domain={[0, 100]}

                      width={44}

                      tick={{ fill: '#7a90a6', fontSize: 10 }}

                      axisLine={false}

                      tickLine={false}

                      tickFormatter={(value) => `${value}%`}

                    />

                    <Tooltip

                      content={<CurveTooltip />}

                      cursor={{

                        stroke: 'rgba(42,182,207,0.28)',

                        strokeWidth: 1,

                      }}

                    />

                    <Line

                      type="monotone"

                      dataKey="planned"

                      name="Rencana"

                      stroke={CHART_COLORS.planned}

                      strokeWidth={2}

                      dot={{

                        r: 2.5,

                        fill: CHART_COLORS.planned,

                        stroke: '#0a111c',

                      }}

                      activeDot={{ r: 5 }}

                      connectNulls={false}

                    />

                    <Line

                      type="monotone"

                      dataKey="actual"

                      name="Aktual"

                      stroke={CHART_COLORS.actual}

                      strokeWidth={2.2}

                      dot={{

                        r: 3,

                        fill: CHART_COLORS.actual,

                        stroke: '#0a111c',

                      }}

                      activeDot={{ r: 5.5 }}

                      connectNulls={false}

                    />

                  </LineChart>

                </ResponsiveContainer>

              ) : (

                <div className="pcr-chart-empty">

                  <BarChart3 size={22} strokeWidth={1.6} />

                  <strong>Data S-Curve belum tersedia</strong>

                  <span>

                    Kurva rencana dan aktual akan tampil setelah data

                    progress proyek tersedia.

                  </span>

                </div>

              )}

            </div>

            <div className="pcr-curve-stats">

              <div>

                <span>Actual Current</span>

                <strong className="is-cyan">

                  {projectProgress.toFixed(2)}%

                </strong>

              </div>

              <div>

                <span>Periode Rencana</span>

                <strong>

                  {curve?.planned_curve?.length ?? 0} titik

                </strong>

              </div>

              <div>

                <span>Data Aktual</span>

                <strong>

                  {curve?.actual_curve?.length ?? 0} titik

                </strong>

              </div>

              <div>

                <span>Titik Terdata</span>

                <strong className="is-amber">

                  {loading ? '—' : poles.length.toLocaleString('id-ID')}

                </strong>

              </div>

            </div>

          </section>

          <section className="pcr-panel" id="aktivitas">

            <div className="pcr-panel-head">

              <div className="pcr-panel-title">

                <span className="pcr-panel-kicker">

                  Monitoring Log

                </span>

                <h2>Aktivitas Progress Terakhir</h2>

              </div>

              <span className="pcr-chip">

                <CheckCircle2 size={12} />

                {activityFeed.length} catatan

              </span>

            </div>

            <div className="pcr-panel-body">

              {activityFeed.length ? (

                <div className="pcr-feed">

                  {activityFeed.map((item, index) => (

                    <div

                      className="pcr-feed-row"

                      key={`${item.date}-${index}`}

                    >

                      <span className="pcr-feed-dot" />

                      <div className="pcr-feed-body">

                        <strong>

                          Realisasi kumulatif{' '}

                          <b>{percent(item.progress_percent)}</b>

                        </strong>

                        <span>

                          {formatDate(item.date, shortDate)}

                          {index === 0

                            ? ' · data aktual terbaru'

                            : ''}

                        </span>

                      </div>

                    </div>

                  ))}

                </div>

              ) : (

                <div className="pcr-chart-empty" style={{ padding: '18px 0' }}>

                  <Activity size={20} strokeWidth={1.6} />

                  <strong>Belum ada aktivitas progress</strong>

                  <span>

                    Catatan aktual akan muncul setelah progress tiang

                    diperbarui.

                  </span>

                </div>

              )}

            </div>

          </section>

        </main>

      </div>

    </div>

  )

}
