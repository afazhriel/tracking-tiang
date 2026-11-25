'use client'

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'

import { formatCoordinate } from '../../lib/format'
import { resolveStatus } from '../../lib/status'

/* Viewport cadangan untuk Jawa Barat. Dipakai hanya kalau tidak
   ada satu pun tiang yang punya koordinat — bukan data tiruan,
   supaya peta tidak pernah menampilkan pin palsu. */
const FALLBACK_CENTER = [-6.9, 107.6]

/**
 * Ikon pin kustom.
 *
 * Icon bawaan Leaflet punya drop shadow yang di atas tile gelap
 * terlihat seperti noda, bukan penanda lokasi. Versi ini memakai
 * divIcon: inti solid, border putih tipis, dan cincin accent
 * transparan supaya tetap terbaca di petak terang maupun gelap.
 */
function buildPin(status) {
  const size = 11

  return L.divIcon({
    className: 'lp-marker',
    html: `<span style="display:block;width:${size}px;height:${size}px;box-sizing:border-box;border-radius:9999px;background:${status.hex};border:2px solid #fff;box-shadow:0 0 0 3px ${status.hex}33,0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  })
}

/**
 * Menyesuaikan viewport supaya semua pin terlihat.
 *
 * Effect ini sengaja bergantung pada `located`, bukan nilai yang
 * lebih granular seperti `pointsKey`. Daftar tiang hasil filter
 * sudah di-memo di pemanggil, jadi referensinya stabil selama
 * data tidak berubah — effect hanya jalan ulang kalau titik yang
 * benar-benar baru masuk atau koordinat berubah.
 */
function FitToPoles({ located, ready }) {
  const map = useMap()

  useEffect(() => {
    if (!ready || !located.length) return

    if (located.length === 1) {
      map.setView([located[0].latitude, located[0].longitude], 14, {
        animate: true,
      })

      return
    }

    map.fitBounds(
      L.latLngBounds(located.map((pole) => [pole.latitude, pole.longitude])),
      {
        padding: [56, 56],
        maxZoom: 15,
        animate: true,
      }
    )
  }, [map, ready, located])

  return null
}

/**
 * Nonaktifkan zoom scroll sampai peta difokuskan.
 *
 * Di landing page, halaman panjang bisa digulir dengan wheel.
 * Kalau peta ikut zoom, halaman ikut ter-scroll dan user kehilangan
 * posisi. Jadi `scrollWheelZoom` mati secara default, dan baru
 * hidup setelah peta diklik — perilaku yang sama dengan Google Maps
 * embedded.
 */
function ScrollGuard({ ready }) {
  const map = useMap()

  useEffect(() => {
    if (ready) map.scrollWheelZoom.disable()
    else map.scrollWheelZoom.enable()

    function onFocus() {
      map.scrollWheelZoom.enable()
    }

    function onBlur(event) {
      /* Jangan matikan lagi kalau blur terjadi karena klik di
         dalam peta itu sendiri (mis. popup), bukan keluar peta. */
      if (!event.relatedTarget || !map.getContainer().contains(event.relatedTarget)) {
        map.scrollWheelZoom.disable()
      }
    }

    const container = map.getContainer()

    container.addEventListener('click', onFocus)
    container.addEventListener('mouseout', onBlur)

    return () => {
      container.removeEventListener('click', onFocus)
      container.removeEventListener('mouseout', onBlur)
      map.scrollWheelZoom.enable()
    }
  }, [map, ready])

  return null
}

export default function LandingPoleMap({ poles = [], loading = false }) {
  const located = useMemo(() => poles.filter((pole) => pole.hasCoordinate), [poles])

  const ready = !loading && located.length > 0
  const center = located.length ? [located[0].latitude, located[0].longitude] : FALLBACK_CENTER

  return (
    <MapContainer
      center={center}
      zoom={located.length ? 13 : 6}
      zoomControl={false}
      attributionControl
      scrollWheelZoom={false}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ScrollGuard ready={ready} />
      <FitToPoles located={located} ready={ready} />

      {located.map((pole) => {
        const status = resolveStatus(pole.status, null)

        return (
          <Marker
            key={pole.id}
            position={[pole.latitude, pole.longitude]}
            icon={buildPin(status)}
          >
            <Popup>
              <div className="min-w-[13rem] space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-[13px] text-neutral-900">
                    {pole.poleCode}
                  </strong>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${status.hex}1a`,
                      color: status.hex,
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                {pole.address && (
                  <p className="m-0 text-[11px] leading-4 text-neutral-600">
                    {pole.address}
                  </p>
                )}

                <p className="m-0 font-mono text-[10px] text-neutral-400">
                  {formatCoordinate(pole.latitude)},{' '}
                  {formatCoordinate(pole.longitude)}
                </p>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}