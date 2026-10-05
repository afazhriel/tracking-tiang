'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { MapPinOff } from 'lucide-react'

import { formatCoordinate, formatPercent } from '../../lib/format'
import { resolveStatus } from '../../lib/status'

/**
 * Viewport cadangan. Hanya dipakai ketika belum ada satu pun tiang
 * yang memiliki koordinat - bukan data tiruan.
 */
const FALLBACK_CENTER = [-6.9, 107.6]

function buildIcon(color, isActive) {
  const size = isActive ? 16 : 12

  return L.divIcon({
    className: 'tt-marker-icon',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,.35);${
      isActive ? 'transform:scale(1.1);' : ''
    }"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  })
}

function FitBounds({ points, pointsKey, enabled }) {
  const map = useMap()
  const pointsRef = useRef(points)

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  useEffect(() => {
    if (!enabled) return

    const current = pointsRef.current

    if (!current.length) return

    if (current.length === 1) {
      map.setView(current[0], 15)

      return
    }

    map.fitBounds(L.latLngBounds(current), {
      padding: [48, 48],
      maxZoom: 17,
    })
  }, [enabled, map, pointsKey])

  return null
}

export default function TiangMap({
  poles = [],
  selectedId = null,
  progressByPole = {},
  onSelect,
}) {
  const points = useMemo(
    () =>
      poles
        .filter((pole) => pole.hasCoordinate)
        .map((pole) => [pole.latitude, pole.longitude]),
    [poles]
  )

  const pointsKey = points.map((point) => point.join(',')).join('|')

  const center = points.length ? points[0] : FALLBACK_CENTER

  return (
    <div className="relative h-full w-full overflow-hidden rounded-card border border-neutral-200 bg-neutral-100">
      <MapContainer
        center={center}
        zoom={points.length ? 13 : 5}
        scrollWheelZoom
        zoomControl
        attributionControl
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds
          points={points}
          pointsKey={pointsKey}
          enabled={points.length > 0}
        />

        {poles
          .filter((pole) => pole.hasCoordinate)
          .map((pole) => {
            const progress = progressByPole[pole.id] ?? null
            const status = resolveStatus(pole.status, progress)
            const isActive = selectedId === pole.id

            return (
              <Marker
                key={pole.id}
                position={[pole.latitude, pole.longitude]}
                icon={buildIcon(status.hex, isActive)}
                eventHandlers={{
                  click: () => onSelect?.(pole),
                }}
                zIndexOffset={isActive ? 1000 : 0}
              >
                <Popup>
                  <div className="min-w-[15rem] space-y-2 font-sans">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-neutral-900">
                        {pole.poleCode}
                      </strong>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${status.hex}1a`,
                          color: status.hex,
                        }}
                      >
                        {status.label}
                      </span>
                    </div>

                    <p className="text-xs leading-5 text-neutral-600">
                      {pole.address || 'Alamat belum diisi'}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
                      <span>
                        Lat{' '}
                        <strong className="text-neutral-700">
                          {formatCoordinate(pole.latitude)}
                        </strong>
                      </span>
                      <span>
                        Lng{' '}
                        <strong className="text-neutral-700">
                          {formatCoordinate(pole.longitude)}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-[11px] text-neutral-500">
                      <span>Progress</span>
                      <strong className="text-neutral-800">
                        {formatPercent(progress)}
                      </strong>
                    </div>

                    <Link
                      href={`/tiang/${pole.id}`}
                      className="block rounded-lg bg-neutral-900 px-3 py-1.5 text-center text-[11px] font-medium text-white"
                    >
                      Lihat Detail
                    </Link>
                  </div>
                </Popup>
              </Marker>
            )
          })}
      </MapContainer>

      {!points.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto flex max-w-xs flex-col items-center rounded-card border border-neutral-200 bg-paper/95 px-5 py-4 text-center shadow-card">
            <MapPinOff className="h-5 w-5 text-neutral-400" />
            <p className="mt-2 text-sm font-medium text-neutral-800">
              Belum ada koordinat
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Tiang pada halaman ini belum memiliki latitude/longitude sehingga
              tidak dapat ditampilkan di peta.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}