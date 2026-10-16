/**
 * SISTEM NADA WARNA (theme tones)
 * ------------------------------------------------------------
 * Satu sumber kebenaran untuk warna depan tiap elemen:
 * kartu statistik, kartu fitur, badge, grafik, dan peta.
 *
 * Semua warna berasal dari token di `app/globals.css`, sehingga
 * menukar karakter visual aplikasi cukup dari satu file.
 *
 * Lapisan nada:
 *  - `soft`   : badge / chip (latar redup + teks + ring)
 *  - `icon`   : kotak ikon
 *  - `solid`  : tombol/label pekat
 *  - `accent` : CSS custom property untuk `.accent-top` di globals
 *  - `hex`    : warna mentah untuk SVG / canvas / recharts / leaflet
 */

export const ACCENT_TONES = {
  brand: {
    label: 'Terracotta',
    soft: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    icon: 'bg-brand-100 text-brand-700',
    iconSolid: 'bg-brand-600 text-white',
    solid: 'bg-brand-600 text-white hover:bg-brand-700',
    outline: 'border-brand-300 bg-brand-50/70 text-brand-800 hover:bg-brand-50',
    bar: 'bg-brand-500',
    text: 'text-brand-700',
    from: 'var(--color-brand-300)',
    to: 'var(--color-brand-700)',
    hex: '#c96f42',
  },
  lagoon: {
    label: 'Lagoon',
    soft: 'bg-lagoon-50 text-lagoon-700 ring-lagoon-600/20',
    icon: 'bg-lagoon-100 text-lagoon-700',
    iconSolid: 'bg-lagoon-600 text-white',
    solid: 'bg-lagoon-600 text-white hover:bg-lagoon-700',
    outline: 'border-lagoon-300 bg-lagoon-50/70 text-lagoon-800 hover:bg-lagoon-50',
    bar: 'bg-lagoon-500',
    text: 'text-lagoon-700',
    from: 'var(--color-lagoon-300)',
    to: 'var(--color-lagoon-700)',
    hex: '#36778a',
  },
  sage: {
    label: 'Sage',
    soft: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    icon: 'bg-emerald-100 text-emerald-700',
    iconSolid: 'bg-emerald-600 text-white',
    solid: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: 'border-emerald-300 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-50',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    from: 'var(--color-emerald-300)',
    to: 'var(--color-emerald-700)',
    hex: '#5f8a50',
  },
  ochre: {
    label: 'Ochre',
    soft: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    icon: 'bg-amber-100 text-amber-700',
    iconSolid: 'bg-amber-600 text-white',
    solid: 'bg-amber-600 text-white hover:bg-amber-700',
    outline: 'border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-50',
    bar: 'bg-amber-500',
    text: 'text-amber-800',
    from: 'var(--color-amber-300)',
    to: 'var(--color-amber-800)',
    hex: '#c88e33',
  },
  clay: {
    label: 'Clay',
    soft: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    icon: 'bg-rose-100 text-rose-700',
    iconSolid: 'bg-rose-600 text-white',
    solid: 'bg-rose-600 text-white hover:bg-rose-700',
    outline: 'border-rose-300 bg-rose-50/70 text-rose-800 hover:bg-rose-50',
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    from: 'var(--color-rose-300)',
    to: 'var(--color-rose-800)',
    hex: '#d3574c',
  },
  plum: {
    label: 'Plum',
    soft: 'bg-plum-50 text-plum-700 ring-plum-600/20',
    icon: 'bg-plum-100 text-plum-700',
    iconSolid: 'bg-plum-600 text-white',
    solid: 'bg-plum-600 text-white hover:bg-plum-700',
    outline: 'border-plum-300 bg-plum-50/70 text-plum-800 hover:bg-plum-50',
    bar: 'bg-plum-500',
    text: 'text-plum-700',
    from: 'var(--color-plum-300)',
    to: 'var(--color-plum-800)',
    hex: '#946095',
  },
  sand: {
    label: 'Sand',
    soft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
    icon: 'bg-neutral-100 text-neutral-600',
    iconSolid: 'bg-neutral-800 text-white',
    solid: 'bg-neutral-800 text-white hover:bg-neutral-900',
    outline: 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-neutral-100',
    bar: 'bg-neutral-400',
    text: 'text-neutral-600',
    from: 'var(--color-neutral-200)',
    to: 'var(--color-neutral-500)',
    hex: '#a89a8a',
  },
  espresso: {
    label: 'Espresso',
    soft: 'bg-neutral-900 text-white ring-neutral-900/20',
    icon: 'bg-neutral-900 text-white',
    iconSolid: 'bg-neutral-900 text-white',
    solid: 'bg-neutral-900 text-white hover:bg-neutral-800',
    outline: 'border-neutral-800 text-neutral-800 hover:bg-neutral-100',
    bar: 'bg-neutral-900',
    text: 'text-neutral-900',
    from: 'var(--color-neutral-700)',
    to: 'var(--color-neutral-950)',
    hex: '#211c18',
  },
}

/**
 * Alias semantik untuk tone status, supaya komponen tidak perlu
 * mengingat nama warna yang "terlihat benar" untuk data tertentu.
 */
export const TONE = {
  neutral: ACCENT_TONES.sand,
  sand: ACCENT_TONES.sand,
  brand: ACCENT_TONES.brand,
  lagoon: ACCENT_TONES.lagoon,
  blue: ACCENT_TONES.lagoon,
  sage: ACCENT_TONES.sage,
  emerald: ACCENT_TONES.sage,
  ochre: ACCENT_TONES.ochre,
  amber: ACCENT_TONES.ochre,
  clay: ACCENT_TONES.clay,
  rose: ACCENT_TONES.clay,
  plum: ACCENT_TONES.plum,
  espresso: ACCENT_TONES.espresso,
  /* Alias status, supaya `status.key` bisa langsung dipakai sebagai
     prop `tone` tanpa komponen perlu tahu nama warnanya. */
  done: ACCENT_TONES.sage,
  active: ACCENT_TONES.lagoon,
  delayed: ACCENT_TONES.ochre,
  issue: ACCENT_TONES.clay,
  idle: ACCENT_TONES.sand,
  unknown: ACCENT_TONES.sand,
}

/**
 * Urutan nada untuk kartu fitur/kartu statistik.
 * Dipakai bergiliran supaya halaman tidak terlihat monoton
 * tanpa harus memilih warna secara manual per elemen.
 */
export const ACCENT_CYCLE = [
  'brand',
  'lagoon',
  'plum',
  'sage',
  'ochre',
  'clay',
  'sand',
  'espresso',
]

/** Mengembalikan tone yang aman (fallback ke `sand`). */
export function tone(name) {
  return TONE[name] || ACCENT_TONES.sand
}

/**
 * Style inline untuk memberi `.accent-top` pada elemen arbitrary.
 * Dipakai komponen yang warnanya datang dari data, bukan dari prop statis.
 */
export function accentVars(name) {
  const resolved = tone(name)

  return {
    '--accent-from': resolved.from,
    '--accent-to': resolved.to,
  }
}

/** Warna hex tone â€” untuk recharts / leaflet / SVG. */
export function toneHex(name) {
  return tone(name).hex
}

/** Nada status (dari lib/status.js) dipetakan ke ACCENT_TONES. */
export const STATUS_TONE_MAP = {
  done: 'sage',
  active: 'sage',
  delayed: 'ochre',
  issue: 'clay',
  idle: 'sand',
  unknown: 'sand',
}



