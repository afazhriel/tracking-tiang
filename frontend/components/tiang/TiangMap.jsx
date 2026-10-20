'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { MapPinOff } from 'lucide-react'

import { formatPercent } from '../../lib/format'
import { detailHref } from '../../lib/native'
import { resolveStatus } from '../../lib/status'

const FALLBACK_CENTER = [-6.9, 107.6]

function buildIcon(color, isActive) {
  const size = isActive ? 18 : 12
  const markerColor = isActive ? '#2563eb' : '#9ca3af'

  return L.divIcon({
    className: 'tt-marker-icon',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${markerColor};border:2.5px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,.35);${
      isActive ? 'transform:scale(1.15);' : ''
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

function FlyToSelected({ poles, selectedId }) {
  const map = useMap()

  useEffect(() => {
    if (selectedId === null || selectedId === undefined) return

    const pole = poles.find((item) => {
      return (
        String(item.id) === String(selectedId) &&
        item.hasCoordinate &&
        Number.isFinite(Number(item.latitude)) &&
        Number.isFinite(Number(item.longitude))
      )
    })

    if (!pole) {
      console.log('[TiangMap] Pole selected tapi koordinat tidak ditemukan:', {
        selectedId,
      })
      return
    }

    const lat = Number(pole.latitude)
    const lng = Number(pole.longitude)

    console.log('[TiangMap] FlyTo:', {
      selectedId,
      id: pole.id,
      lat,
      lng,
    })

    map.flyTo([lat, lng], 19, {
      animate: true,
      duration: 1.2,
      easeLinearity: 0.25,
    })
  }, [map, poles, selectedId])

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
        .map((pole) => [
          Number(pole.latitude),
          Number(pole.longitude),
        ]),
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
        className="h-full w-full z-0"
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

        <FlyToSelected
          poles={poles}
          selectedId={selectedId}
        />

        {poles
          .filter((pole) => pole.hasCoordinate)
          .map((pole) => {
            const progress = progressByPole[pole.id] ?? null
            const status = resolveStatus(pole.status, progress)
            const isActive =
              String(selectedId) === String(pole.id)


            return (
              <Marker
                key={pole.id}
                position={[
                  Number(pole.latitude),
                  Number(pole.longitude),
                ]}
                icon={buildIcon(status.hex, isActive)}
                eventHandlers={{
                  click: () => onSelect?.(pole),
                }}
                zIndexOffset={isActive ? 1000 : 0}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <div className="font-semibold">
                      {pole.code ?? pole.name ?? `Tiang ${pole.id}`}
                    </div>

                    <div className="mt-1 text-xs text-neutral-500">
  {Number(pole.latitude).toFixed(6)}, {Number(pole.longitude).toFixed(6)}
</div>

                    <div className="mt-2 text-sm">
                      Progress:{' '}
                      {formatPercent(progress)}
                    </div>

                    <Link
                      href={detailHref('/tiang', pole.id)}
                      className="mt-2 inline-block text-xs font-medium text-orange-600 hover:underline"
                    >
                      Lihat detail
                    </Link>
                  </div>
                </Popup>
              </Marker>
            )
          })}
      </MapContainer>

      {!poles.some((pole) => pole.hasCoordinate) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-4 py-3 text-sm text-neutral-500 shadow-sm">
            <MapPinOff className="h-4 w-4" />
            Belum ada koordinat tiang.
          </div>
        </div>
      )}
    </div>
  )
}






