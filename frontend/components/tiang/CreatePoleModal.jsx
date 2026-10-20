'use client'

import { useEffect, useState } from 'react'
import { CircleAlert, MapPin, Plus, MapPinCheck, Loader2 } from 'lucide-react'

import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import {
  FormField,
  Modal,
  SelectInput,
  SubmitButton,
  TextArea,
  TextInput,
} from '../ui/modal'
import { ActionButton } from '../layout/PageHeader'
import { getCurrentPosition, isNative } from '../../lib/capacitor'

const EMPTY_FORM = {
  pole_code: '',
  region_id: '',
  province_id: '',
  regency_id: '',
  district_id: '',
  village_id: '',
  address: '',
  latitude: '',
  longitude: '',
  status: '',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Biarkan kosong' },
  { value: 'rencana', label: 'rencana - Belum mulai' },
  { value: 'proses', label: 'proses - Sedang dikerjakan' },
  { value: 'selesai', label: 'selesai - Selesai 100%' },
  { value: 'delay', label: 'delay - Terlambat' },
  { value: 'kendala', label: 'kendala - Bermasalah' },
]

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

/**
 * Form tambah tiang.
 *
 * Menyimpan satu titik tiang ke:
 * POST /api/projects/{project}/poles
 *
 * Mendukung hierarchy wilayah:
 * provinsi -> kabupaten/kota -> kecamatan -> desa/kelurahan.
 *
 * `region_id` tetap dipertahankan sebagai wilayah project lama
 * untuk kompatibilitas dengan data yang sudah ada.
 */
export function CreatePoleModal({
  open,
  onClose,
  onCreated,
  projectId,
  regions,
  allowedProvinces = null,
  requireProvince = false,
}) {
  const [form, setForm] = useState(EMPTY_FORM)

  const [provinces, setProvinces] = useState([])
  const [regencies, setRegencies] = useState([])
  const [districts, setDistricts] = useState([])
  const [villages, setVillages] = useState([])

  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingRegencies, setLoadingRegencies] = useState(false)
  const [loadingDistricts, setLoadingDistricts] = useState(false)
  const [loadingVillages, setLoadingVillages] = useState(false)

  const [fieldErrors, setFieldErrors] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  const native = isNative()

  /* Non-admin hanya boleh memilih provinsi yang ditugaskan. Admin
     (`allowedProvinces === null`) melihat seluruh provinsi. */
  const allowedIds = Array.isArray(allowedProvinces)
    ? allowedProvinces.map((province) => String(province.id))
    : null

  const provinceOptions = allowedIds
    ? provinces.filter((province) => allowedIds.includes(String(province.id)))
    : provinces

  /* Kalau user hanya ditugaskan ke satu provinsi, pakai nilai itu tanpa
     perlu memaksa user memilih lagi (dihitung, bukan disimpan di effect). */
  const defaultProvinceId =
    allowedIds && allowedIds.length === 1 ? allowedIds[0] : ''

  const effectiveProvinceId = form.province_id || defaultProvinceId

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadProvinces() {
      setLoadingProvinces(true)

      try {
        const payload = await api.listProvinces({ cache: 'no-store' })

        if (!cancelled) {
          setProvinces(unwrapList(payload))
        }
      } catch {
        if (!cancelled) {
          setProvinces([])
        }
      } finally {
        if (!cancelled) {
          setLoadingProvinces(false)
        }
      }
    }

    loadProvinces()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!effectiveProvinceId) return

    let cancelled = false

    async function loadRegencies() {
      setLoadingRegencies(true)

      try {
        const payload = await api.listRegencies(
          effectiveProvinceId,
          { cache: 'no-store' }
        )

        if (!cancelled) {
          setRegencies(unwrapList(payload))
        }
      } catch {
        if (!cancelled) {
          setRegencies([])
        }
      } finally {
        if (!cancelled) {
          setLoadingRegencies(false)
        }
      }
    }

    loadRegencies()

    return () => {
      cancelled = true
    }
  }, [effectiveProvinceId])

  useEffect(() => {
    if (!form.regency_id) return

    let cancelled = false

    async function loadDistricts() {
      setLoadingDistricts(true)

      try {
        const payload = await api.listDistricts(
          form.regency_id,
          { cache: 'no-store' }
        )

        if (!cancelled) {
          setDistricts(unwrapList(payload))
        }
      } catch {
        if (!cancelled) {
          setDistricts([])
        }
      } finally {
        if (!cancelled) {
          setLoadingDistricts(false)
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [form.regency_id])

  useEffect(() => {
    if (!form.district_id) return

    let cancelled = false

    async function loadVillages() {
      setLoadingVillages(true)

      try {
        const payload = await api.listVillages(
          form.district_id,
          { cache: 'no-store' }
        )

        if (!cancelled) {
          setVillages(unwrapList(payload))
        }
      } catch {
        if (!cancelled) {
          setVillages([])
        }
      } finally {
        if (!cancelled) {
          setLoadingVillages(false)
        }
      }
    }

    loadVillages()

    return () => {
      cancelled = true
    }
  }, [form.district_id])

  function update(field) {
    return (event) => {
      const value = event.target.value

      setForm((previous) => {
        const next = {
          ...previous,
          [field]: value,
        }

        if (field === 'province_id') {
          next.regency_id = ''
          next.district_id = ''
          next.village_id = ''

          /* Bersihkan hierarki turunan di sini (event handler),
             bukan di effect — pilihan lama tidak boleh tampil saat
             mengganti provinsi. */
          setRegencies([])
          setDistricts([])
          setVillages([])
        }

        if (field === 'regency_id') {
          next.district_id = ''
          next.village_id = ''

          setDistricts([])
          setVillages([])
        }

        if (field === 'district_id') {
          next.village_id = ''

          setVillages([])
        }

        return next
      })

      setFieldErrors((previous) => {
        if (!previous) return previous

        const next = { ...previous }

        delete next[field]

        return Object.keys(next).length ? next : null
      })
    }
  }

  function reset() {
    setForm(EMPTY_FORM)
    setRegencies([])
    setDistricts([])
    setVillages([])
    setFieldErrors(null)
    setFormError(null)
    setSaving(false)
  }

  async function handleGetCurrentLocation() {
    if (gettingLocation) return

    setGettingLocation(true)
    setFieldErrors((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      delete next.latitude
      delete next.longitude
      return Object.keys(next).length ? next : null
    })

    try {
      const position = await getCurrentPosition()
      const { latitude, longitude } = position.coords

      setForm((prev) => ({
        ...prev,
        latitude: String(latitude),
        longitude: String(longitude),
      }))
    } catch (error) {
      setFormError(error)
    } finally {
      setGettingLocation(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    if (requireProvince && !effectiveProvinceId) {
      setFieldErrors({
        province_id: [
          allowedIds && !allowedIds.length
            ? 'Anda belum ditugaskan ke provinsi mana pun. Hubungi admin.'
            : 'Pilih provinsi yang ditugaskan kepada Anda.',
        ],
      })
      setFormError(null)
      return
    }

    setSaving(true)
    setFieldErrors(null)
    setFormError(null)

    const payload = {
      pole_code: form.pole_code.trim(),
    }

    if (form.region_id) payload.region_id = Number(form.region_id)
    if (effectiveProvinceId) payload.province_id = effectiveProvinceId
    if (form.regency_id) payload.regency_id = form.regency_id
    if (form.district_id) payload.district_id = form.district_id
    if (form.village_id) payload.village_id = form.village_id
    if (form.address.trim()) payload.address = form.address.trim()
    if (form.latitude.trim()) payload.latitude = Number(form.latitude)
    if (form.longitude.trim()) payload.longitude = Number(form.longitude)
    if (form.status) payload.status = form.status

    try {
      const response = await api.createPole(projectId, payload)

      reset()
      onCreated?.(response?.data ?? null)
      onClose()
    } catch (error) {
      if (error?.isUnprocessable && error.fieldErrors) {
        setFieldErrors(error.fieldErrors)
      } else {
        setFormError(error)
      }

      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah Tiang"
      description="Simpan satu titik tiang ke project aktif."
      size="lg"
      footer={
        <>
          <ActionButton onClick={onClose} type="button">
            Batal
          </ActionButton>

          <SubmitButton
            loading={saving}
            loadingLabel="Menyimpan..."
            form="create-pole-form"
          >
            Simpan Tiang
          </SubmitButton>
        </>
      }
    >
      <form
        id="create-pole-form"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-clay-300/70 bg-clay-50 px-4 py-3"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-clay-700" />

            <div>
              <p className="text-sm font-medium text-clay-800">
                Tiang gagal disimpan
              </p>

              <p className="mt-0.5 text-xs leading-5 text-clay-700">
                {formError.message}
              </p>
            </div>
          </div>
        )}

        <FormField
          label="Kode Tiang"
          htmlFor="pole-code"
          required
          error={fieldErrors?.pole_code?.[0]}
          hint="Kode unik di lapangan, misalnya TLG-001."
        >
          <TextInput
            id="pole-code"
            name="pole_code"
            value={form.pole_code}
            onChange={update('pole_code')}
            invalid={Boolean(fieldErrors?.pole_code)}
            maxLength={255}
            required
            placeholder="TLG-001"
            autoComplete="off"
          />
        </FormField>

        <FormField
          label="Wilayah Project"
          htmlFor="pole-region"
          error={fieldErrors?.region_id?.[0]}
          hint={
            regions?.length
              ? 'Opsional. Wilayah project lama.'
              : 'Project ini belum memiliki wilayah project.'
          }
        >
          <SelectInput
            id="pole-region"
            name="region_id"
            value={form.region_id}
            onChange={update('region_id')}
            invalid={Boolean(fieldErrors?.region_id)}
            disabled={!regions?.length}
          >
            <option value="">Tanpa wilayah project</option>

            {regions?.map((region) => (
              <option key={region.id} value={region.id}>
                {region.code ? `${region.code} - ${region.name}` : region.name}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-neutral-800">
              Wilayah Indonesia
            </p>

            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Pilih wilayah secara berurutan dari provinsi sampai
              desa/kelurahan.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Provinsi"
              htmlFor="pole-province"
              required={requireProvince}
              error={fieldErrors?.province_id?.[0]}
              hint={
                allowedIds && !allowedIds.length
                  ? 'Anda belum ditugaskan ke provinsi mana pun.'
                  : undefined
              }
            >
              <SelectInput
                id="pole-province"
                name="province_id"
                value={effectiveProvinceId}
                onChange={update('province_id')}
                invalid={Boolean(fieldErrors?.province_id)}
                disabled={loadingProvinces || (allowedIds !== null && !allowedIds.length)}
              >
                <option value="">
                  {loadingProvinces
                    ? 'Memuat provinsi...'
                    : provinceOptions.length === 0
                      ? 'Tidak ada provinsi yang bisa dipilih'
                      : 'Pilih provinsi'}
                </option>

                {provinceOptions.map((province) => (
                  <option key={province.id} value={province.id}>
                    {province.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField
              label="Kabupaten/Kota"
              htmlFor="pole-regency"
              error={fieldErrors?.regency_id?.[0]}
            >
              <SelectInput
                id="pole-regency"
                name="regency_id"
                value={form.regency_id}
                onChange={update('regency_id')}
                invalid={Boolean(fieldErrors?.regency_id)}
                disabled={!form.province_id || loadingRegencies}
              >
                <option value="">
                  {loadingRegencies
                    ? 'Memuat kabupaten/kota...'
                    : !form.province_id
                      ? 'Pilih provinsi dahulu'
                      : 'Pilih kabupaten/kota'}
                </option>

                {regencies.map((regency) => (
                  <option key={regency.id} value={regency.id}>
                    {regency.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField
              label="Kecamatan"
              htmlFor="pole-district"
              error={fieldErrors?.district_id?.[0]}
            >
              <SelectInput
                id="pole-district"
                name="district_id"
                value={form.district_id}
                onChange={update('district_id')}
                invalid={Boolean(fieldErrors?.district_id)}
                disabled={!form.regency_id || loadingDistricts}
              >
                <option value="">
                  {loadingDistricts
                    ? 'Memuat kecamatan...'
                    : !form.regency_id
                      ? 'Pilih kabupaten/kota dahulu'
                      : 'Pilih kecamatan'}
                </option>

                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField
              label="Desa/Kelurahan"
              htmlFor="pole-village"
              error={fieldErrors?.village_id?.[0]}
            >
              <SelectInput
                id="pole-village"
                name="village_id"
                value={form.village_id}
                onChange={update('village_id')}
                invalid={Boolean(fieldErrors?.village_id)}
                disabled={!form.district_id || loadingVillages}
              >
                <option value="">
                  {loadingVillages
                    ? 'Memuat desa/kelurahan...'
                    : !form.district_id
                      ? 'Pilih kecamatan dahulu'
                      : 'Pilih desa/kelurahan'}
                </option>

                {villages.map((village) => (
                  <option key={village.id} value={village.id}>
                    {village.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>
        </div>

        <FormField
          label="Alamat"
          htmlFor="pole-address"
          error={fieldErrors?.address?.[0]}
        >
          <TextArea
            id="pole-address"
            name="address"
            value={form.address}
            onChange={update('address')}
            invalid={Boolean(fieldErrors?.address)}
            rows={2}
            placeholder="Jalan, desa, atau patokan lokasi"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Latitude"
            htmlFor="pole-latitude"
            error={fieldErrors?.latitude?.[0]}
            hint="-90 sampai 90. Boleh kosong."
          >
            <div className="flex gap-2">
              <TextInput
                id="pole-latitude"
                name="latitude"
                type="number"
                inputMode="decimal"
                step="any"
                min={-90}
                max={90}
                value={form.latitude}
                onChange={update('latitude')}
                invalid={Boolean(fieldErrors?.latitude)}
                placeholder="-6.9127"
                className="flex-1"
              />
              {native && (
                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    gettingLocation
                      ? 'border-neutral-200 bg-neutral-100 text-neutral-500'
                      : 'border-neutral-300 bg-paper text-neutral-700 hover:border-brand-400 hover:bg-brand-50'
                  )}
                  title="Ambil lokasi GPS saat ini"
                >
                  {gettingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPinCheck className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </FormField>

          <FormField
            label="Longitude"
            htmlFor="pole-longitude"
            error={fieldErrors?.longitude?.[0]}
            hint="-180 sampai 180. Boleh kosong."
          >
            <TextInput
              id="pole-longitude"
              name="longitude"
              type="number"
              inputMode="decimal"
              step="any"
              min={-180}
              max={180}
              value={form.longitude}
              onChange={update('longitude')}
              invalid={Boolean(fieldErrors?.longitude)}
              placeholder="107.6186"
            />
          </FormField>
        </div>

        <FormField
          label="Status"
          htmlFor="pole-status"
          error={fieldErrors?.status?.[0]}
          hint="Status mengikuti nilai yang digunakan aplikasi."
        >
          <SelectInput
            id="pole-status"
            name="status"
            value={form.status}
            onChange={update('status')}
            invalid={Boolean(fieldErrors?.status)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-canvas px-4 py-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />

          <p className="text-xs leading-5 text-neutral-500">
            Koordinat yang diisi akan langsung digunakan sebagai lokasi
            tiang pada peta monitoring. Jika kosong, tiang tetap dapat
            disimpan.
          </p>
        </div>
      </form>
    </Modal>
  )
}

/** Tombol pembuka modal tambah tiang. */
export function CreatePoleButton({ onClick, disabled, className }) {
  return (
    <ActionButton
      onClick={onClick}
      icon={Plus}
      variant="primary"
      disabled={disabled}
      title={disabled ? 'Project belum siap dimuat' : undefined}
      className={className}
    >
      Tambah Tiang
    </ActionButton>
  )
}