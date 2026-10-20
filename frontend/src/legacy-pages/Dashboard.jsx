import Sidebar from '../components/Sidebar'

import { useEffect, useMemo, useState } from 'react'

import {

  BarChart3,

  CalendarDays,

  CheckCircle2,

  Map,

  MapPin,

  Target,

  TrendingUp,

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

  Legend,

  Line,

  LineChart,

  Tooltip,

  XAxis,

  YAxis,

} from 'recharts'

import L from 'leaflet'

import 'leaflet/dist/leaflet.css'

import './Dashboard.css'



const PROJECT_ID = 1



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



function FitMap({ poles }) {

  const map = useMap()



  useEffect(() => {

    if(!poles.length) return



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

  const [loading, setLoading] = useState(true)



  useEffect(() => {

    async function loadDashboard() {

      try {

        const [projectResponse, polesResponse, curveResponse] =

          await Promise.all([

            fetch(`/api/projects/${PROJECT_ID}`),

            fetch(`/api/projects/${PROJECT_ID}/poles`),

            fetch(`/api/projects/${PROJECT_ID}/curve`),

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

      }

    }



    loadDashboard()

  }, [])



useEffect(() => {

  if (!selectedPole) {

    return

  }



  async function loadPoleProgress() {

    try {

      const response = await fetch(

        `/api/projects/${PROJECT_ID}/poles/${selectedPole.id}/progress`,

      )



      const json = await response.json()



      setPoleProgress(json.data || [])

    } catch (error) {

      console.error(

        'Progress tiang gagal dimuat:',

        error,

      )

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

    setProgressMessage('Pilih pekerjaan terlebih dahulu.')

    return

  }



  const value = Number(progressInput)



  if (!Number.isFinite(value) || value < 0 || value > 100) {

    setProgressMessage('Progress harus berada di antara 0 sampai 100%.')

    return

  }



  setSavingProgress(true)

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



    setProgressMessage(

      json.message || 'Progress berhasil disimpan.',

    )



    setProgressNotes('')

  } catch (error) {

    console.error('Gagal menyimpan progress:', error)

    setProgressMessage(error.message)

  } finally {

    setSavingProgress(false)

  }

}



const workItemCount = project?.work_items?.length ?? 0

const targetPoles = project?.total_target_poles ?? 0



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

    label: new Date(item.date).toLocaleDateString('id-ID', {

      day: '2-digit',

      month: 'short',

      year: 'numeric',

    }),

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

        label: new Date(item.date).toLocaleDateString('id-ID', {

          day: '2-digit',

          month: 'short',

          year: 'numeric',

        }),

        planned: null,

        actual: Number(item.progress_percent || 0),

      })

    }

  })



  return rows.sort((a, b) => a.date.localeCompare(b.date))

}, [curve])



return (

  <div className="dashboard-layout">
    <Sidebar />
    <main className="dashboard-page">

      <header className="dashboard-header">

        <div>

          <span className="dashboard-kicker">

            PROJECT CONTROL ROOM

          </span>



          <h1>{project?.name ?? 'Tracking Proyek'}</h1>



          <div className="dashboard-header-meta">

            <span className="project-code">

              {project?.code ?? 'TT-001'}

            </span>

            <span className="project-status-pill">

              <span className="dot" />

              {project?.status === 'active'

                ? 'PROJECT ACTIVE'

                : (project?.status ?? 'ACTIVE').toUpperCase()}

            </span>

            <span className="project-period">

              {project?.start_date

                ? new Date(project.start_date).toLocaleDateString('id-ID', {

                  day: '2-digit',

                  month: 'short',

                  year: 'numeric',

                })

                : '—'}

              {' → '}

              {project?.end_date

                ? new Date(project.end_date).toLocaleDateString('id-ID', {

                  day: '2-digit',

                  month: 'short',

                  year: 'numeric',

                })

                : '—'}

            </span>

          </div>



          <p>

            Monitoring progress dan lokasi pekerjaan proyek secara terpusat.

          </p>

        </div>



        <a href="/" className="back-home">

          ← Landing Page

        </a>

      </header>



      <section className="dashboard-stats">

        <article className="kpi-card">

          <div className="kpi-card-header">

            <span className="kpi-label">TOTAL TARGET TIANG</span>

            <Target size={18} className="kpi-icon" />

          </div>

          <strong className="kpi-value">

            {loading

              ? '—'

              : targetPoles.toLocaleString('id-ID')}

          </strong>

          <span className="kpi-sub">Target proyek</span>

        </article>



        <article className="kpi-card">

          <div className="kpi-card-header">

            <span className="kpi-label">PROGRESS PROYEK</span>

            <TrendingUp size={18} className="kpi-icon" />

          </div>

          <strong className="kpi-value">

            {loading ? '—' : `${projectProgress.toFixed(2)}%`}

          </strong>

          <span className="kpi-sub">Aktual saat ini</span>

        </article>



        <article className="kpi-card">

          <div className="kpi-card-header">

            <span className="kpi-label">TITIK TERDATA</span>

            <MapPin size={18} className="kpi-icon" />

          </div>

          <strong className="kpi-value">

            {loading

              ? '—'

              : `${poles.length.toLocaleString('id-ID')} / ${targetPoles.toLocaleString('id-ID')}`}

          </strong>

          <span className="kpi-sub">Lokasi tercatat</span>

        </article>



        <article className="kpi-card">

          <div className="kpi-card-header">

            <span className="kpi-label">ITEM PEKERJAAN</span>

            <BarChart3 size={18} className="kpi-icon" />

          </div>

          <strong className="kpi-value">{workItemCount}</strong>

          <span className="kpi-sub">Work items</span>

        </article>

      </section>



      <section className="dashboard-main-grid">

        <div className="map-panel" id="tiang">

          <div className="panel-header">

            <div>

              <span className="panel-kicker">

                LIVE LOCATION

              </span>



              <h2>

                Peta Lokasi Tiang

              </h2>

            </div>



            <div className="map-status">

              <span />

              {poles.length} titik

            </div>

          </div>



          <div className="map-wrapper">

            <MapContainer

              center={mapCenter}

              zoom={13}

              scrollWheelZoom

              className="project-map"

            >

              <TileLayer

                attribution='&copy; OpenStreetMap contributors'

                url="https\://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

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

                    click: () => setSelectedPole(pole),

                  }}

                >

                  <Popup>

                    <div className="pole-popup">

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



            {selectedPole && (

              <div className="pole-detail-panel">

                <button

                  type="button"

                  className="pole-detail-close"

                  onClick={() => setSelectedPole(null)}

                  aria-label="Tutup detail tiang"

                >

                  ×

                </button>



                <div className="pole-detail-kicker">

                  FIELD ASSET DETAIL

                </div>



                <div className="pole-detail-title-row">

                  <div>

                    <h3>{selectedPole.pole_code}</h3>

                    <p>

                      {selectedPole.address ||

                        'Alamat belum tersedia'}

                    </p>

                  </div>



                  <span className="pole-detail-status">

                    {selectedPole.status?.toUpperCase() || 'ACTIVE'}

                  </span>

                </div>



                <div className="pole-detail-progress">

                  <div>

                    <span>Progress Tiang</span>

                    <strong>

                      {selectedPoleProgress.toFixed(2)}%

                    </strong>

                  </div>



                  <div className="pole-progress-track">

                    <div

                      className="pole-progress-fill"

                      style={{

                        width: `${Math.min(

                          selectedPoleProgress,

                          100,

                        )}%`,

                      }}

                    />

                  </div>

                </div>



                <form

                  className="progress-form"

                  onSubmit={handleSaveProgress}

                >

                  <div className="progress-form-title">

                    UPDATE PROGRESS

                  </div>



                  <label>

                    <span>Pekerjaan</span>



                    <select

                      value={selectedWorkItemId}

                      onChange={handleWorkItemChange}

                    >

                      <option value="">

                        Pilih pekerjaan...

                      </option>



                      {(project?.work_items || []).map(

                        (workItem) => (

                          <option

                            key={workItem.id}

                            value={workItem.id}

                          >

                            {workItem.sequence}. {workItem.name}

                          </option>

                        ),

                      )}

                    </select>

                  </label>



                  <label>

                    <span>Progress (%)</span>



                    <input

                      type="number"

                      min="0"

                      max="100"

                      step="0.01"

                      value={progressInput}

                      onChange={(event) =>

                        setProgressInput(event.target.value)

                      }

                      placeholder="0 - 100"

                    />

                  </label>



                  <label>

                    <span>Catatan</span>



                    <textarea

                      value={progressNotes}

                      onChange={(event) =>

                        setProgressNotes(event.target.value)

                      }

                      placeholder="Catatan pekerjaan (opsional)"

                      rows="2"

                    />

                  </label>



                  <button

                    type="submit"

                    className="save-progress-button"

                    disabled={

                      savingProgress ||

                      !selectedWorkItemId

                    }

                  >

                    {savingProgress

                      ? 'Menyimpan...'

                      : 'Simpan Progress'}

                  </button>



                  {progressMessage && (

                    <div className="progress-message">

                      {progressMessage}

                    </div>

                  )}

                </form>



                <div className="pole-work-list">

                  <div className="pole-work-heading">

                    <span>PEKERJAAN</span>

                    <span>PROGRESS</span>

                  </div>



                  {(project?.work_items || []).map((workItem) => {

                    const progress = poleProgress.find(

                      (item) =>

                        item.work_item_id === workItem.id,

                    )



                    const value = Number(

                      progress?.progress_percent ?? 0,

                    )



                    return (

                      <div

                        className="pole-work-item"

                        key={workItem.id}

                      >

                        <div className="pole-work-info">

                          <strong>

                            {workItem.name}

                          </strong>



                          <span>

                            Bobot {workItem.weight_percent}%

                          </span>

                        </div>



                        <div className="pole-work-value">

                          <strong>{value.toFixed(0)}%</strong>



                          <div className="mini-progress">

                            <div

                              style={{

                                width: `${value}%`,

                              }}

                            />

                          </div>

                        </div>

                      </div>

                    )

                  })}

                </div>

              </div>

            )}



            {!loading && poles.length === 0 && (

              <div className="empty-map">

                <Map size={25} />

                <strong>Belum ada titik tiang</strong>

                <span>

                  Data lokasi akan muncul setelah titik

                  proyek tersedia.

                </span>

              </div>

            )}

          </div>

        </div>



        <aside className="project-side-panel" id="pekerjaan">

          <div className="panel-header">

            <div>

              <span className="panel-kicker">

                PROJECT FLOW

              </span>

              <h2>Ringkasan Proyek</h2>

            </div>



            <CheckCircle2

              className="active-icon"

              size={22}

            />

          </div>



          <div className="status-box">

            <span>STATUS</span>

            <strong>

              {project?.status === 'active'

                ? 'ACTIVE'

                : project?.status ?? '—'}

            </strong>

          </div>



          <div className="date-row">

            <CalendarDays size={17} />

            <div>

              <span>PERIODE PROYEK</span>

              <strong>

                {project?.start_date

                  ? new Date(project.start_date).toLocaleDateString(

                    'id-ID',

                    {

                      day: '2-digit',

                      month: 'short',

                      year: 'numeric',

                    },

                  )

                  : '—'}

                {' → '}

                {project?.end_date

                  ? new Date(project.end_date).toLocaleDateString(

                    'id-ID',

                    {

                      day: '2-digit',

                      month: 'short',

                      year: 'numeric',

                    },

                  )

                  : '—'}

              </strong>

            </div>

          </div>



          <div className="progress-block">

            <div className="progress-heading">

              <span>REALISASI</span>

              <strong>

                {projectProgress.toFixed(2)}%

              </strong>

            </div>



            <div className="progress-track">

              <div

                className="progress-fill"

                style={{

                  width: `${Math.min(projectProgress, 100)}%`,

                }}

              />

            </div>

          </div>



          <div className="work-summary">

            <div>

              <span>WORK ITEMS</span>

              <strong>{workItemCount}</strong>

            </div>



            <div>

              <span>TITIK TERDATA</span>

              <strong>{poles.length}</strong>

            </div>

          </div>

        </aside>

      </section>



      <section className="curve-panel" id="kurva-s">

        <div className="panel-header">

          <div>

            <span className="panel-kicker">

              PROJECT PERFORMANCE

            </span>



            <h2>S-Curve Progress</h2>

            <p className="panel-sub">Perbandingan Rencana vs Aktual</p>

          </div>



          <div className="curve-legend">

            <div className="legend-item">

              <span className="dot planned" />

              <span>Rencana</span>

            </div>

            <div className="legend-item">

              <span className="dot actual" />

              <span>Aktual</span>

            </div>

          </div>

        </div>



        <div className="curve-chart">

          <LineChart

            width={900}

            height={330}

            data={curveData}

            margin={{

              top: 20,

              right: 20,

              left: 0,

              bottom: 10,

            }}

            style={{

              width: '100%',

              height: '330px',

            }}

          >

            <CartesianGrid

              stroke="rgba(125,211,252,0.08)"

              vertical={false}

            />



            <XAxis

              dataKey="label"

              tick={{

                fill: '#7890a6',

                fontSize: 9,

              }}

              axisLine={{

                stroke: 'rgba(125,211,252,0.12)',

              }}

              tickLine={false}

            />



            <YAxis

              domain={[0, 100]}

              tick={{

                fill: '#7890a6',

                fontSize: 9,

              }}

              axisLine={false}

              tickLine={false}

              tickFormatter={(value) => `${value}%`}

            />



            <Tooltip

              contentStyle={{

                background: 'rgba(9, 13, 19, 0.98)',

                border: '1px solid rgba(245, 166, 35, 0.45)',

                borderRadius: 8,

                color: '#f3f5f7',

                fontSize: 11,

                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',

              }}

              labelStyle={{

                color: '#9aa3b2',

                fontSize: 10,

                textTransform: 'uppercase',

                letterSpacing: '0.12em',

              }}

              formatter={(value, name) => [

                `${Number(value).toFixed(2)}%`,

                name === 'planned'

                  ? 'Rencana'

                  : 'Aktual',

              ]}

            />



            <Legend

              wrapperStyle={{

                color: '#94a3b8',

                fontSize: 10,

                paddingTop: 12,

              }}

              formatter={(value) =>

                value === 'planned'

                  ? 'Rencana'

                  : 'Aktual'

              }

            />



            <Line

              type="monotone"

              dataKey="planned"

              stroke="#60a5fa"

              strokeWidth={2.5}

              dot={{

                r: 3,

                fill: '#60a5fa',

                stroke: '#0f1620',

              }}

              activeDot={{

                r: 5,

              }}

              connectNulls={false}

            />



            <Line

              type="monotone"

              dataKey="actual"

              stroke="#f5a623"

              strokeWidth={2.5}

              dot={{

                r: 3.5,

                fill: '#f5a623',

                stroke: '#0f1620',

              }}

              activeDot={{

                r: 6,

              }}

              connectNulls={false}

            />

          </LineChart>

        </div>



        <div className="curve-footer">

          <div>

            <span className="micro-label">ACTUAL CURRENT</span>

            <strong>

              {projectProgress.toFixed(2)}%

            </strong>

          </div>



          <div>

            <span className="micro-label">PERIODE RENCANA</span>

            <strong>

              {curve?.planned_curve?.length ?? 0} bulan

            </strong>

          </div>



          <div>

            <span className="micro-label">DATA AKTUAL</span>

            <strong>

              {loading ? '—' : poles.length.toLocaleString('id-ID')} titik

            </strong>

          </div>



          <div>

            <span className="micro-label">ACTUAL HISTORY</span>

            <strong>

              {(curve?.actual_curve?.length ?? 0)} titik data

            </strong>

          </div>

        </div>

      </section>

    </main>
  </div>

)

}
