/**
 * Generator aset logo — jalankan sekali setiap kali SVG di
 * `public/brand/` diubah:
 *
 *   node scripts/generate-icons.mjs
 *
 * Yang dihasilkan:
 *   1. public/icons/icon-*.png      ikon PWA (dirujuk manifest.json)
 *   2. public/apple-touch-icon.png  ikon iOS / tambah ke layar utama
 *   3. public/favicon-32/16.png     ikon tab browser (pelengkap SVG)
 *   4. android/app/src/main/res/mipmap-  ic_launcher (+ round + foreground)
 *
 * sharp sudah terpasang sebagai dependensi Next.js untuk optimasi
 * gambar, jadi generator ini tidak menambah dependensi apa pun.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptsDir, '..')

const markSvg = path.join(projectRoot, 'public', 'brand', 'logo-mark.svg')
const pinSvg = path.join(projectRoot, 'public', 'brand', 'logo-pin.svg')
const iconsDir = path.join(projectRoot, 'public', 'icons')
const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res')

/** Ukuran ikon PWA — persis seperti yang diminta manifest.json. */
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

/**
 * Icon launcher Android per density:
 *  - `size`      : ic_launcher.png / ic_launcher_round.png (48dp base)
 *  - `foreground`: ic_launcher_foreground.png (108dp base, ruang aman
 *                  sudah digambar di dalam SVG-nya)
 */
const DENSITIES = [
  { dir: 'mipmap-mdpi', size: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', size: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', size: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', size: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', size: 192, foreground: 432 },
]

const APPLE_TOUCH_SIZE = 180
const FAVICON_SIZES = [32, 16]

/** Lingkaran penuh berukuran `size` — dipakai sebagai mask untuk versi round. */
function circleMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  )
}

async function renderSquare(svg, size) {
  return sharp(svg).resize(size, size).png().toBuffer()
}

async function renderRound(svg, size) {
  const base = await renderSquare(svg, size)

  return sharp(base)
    .composite([{ input: circleMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function renderForeground(size) {
  /* Pin sudah digambar dengan ruang aman di dalam viewBox 108 —
     cukup di-*contain* ke kanvas seukuran density. */
  return sharp(pinSvg)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
}

async function write(relativePath, buffer) {
  const target = path.join(projectRoot, relativePath)

  await mkdir(path.dirname(target), { recursive: true })
  await sharp(buffer).toFile(target)

  console.log(`  ${relativePath}`)
}

async function main() {
  console.log('Ikon PWA (public/icons)')
  for (const size of PWA_SIZES) {
    const buffer = await renderSquare(markSvg, size)
    await write(`public/icons/icon-${size}x${size}.png`, buffer)
  }

  console.log('Ikon Apple / favicon PNG')
  await write(
    'public/apple-touch-icon.png',
    await renderSquare(markSvg, APPLE_TOUCH_SIZE)
  )

  for (const size of FAVICON_SIZES) {
    await write(
      `public/favicon-${size}.png`,
      await renderSquare(markSvg, size)
    )
  }

  console.log('Icon launcher Android (android/app/src/main/res)')
  for (const density of DENSITIES) {
    const launcher = await renderSquare(markSvg, density.size)
    const round = await renderRound(markSvg, density.size)
    const foreground = await renderForeground(density.foreground)

    await write(`android/app/src/main/res/${density.dir}/ic_launcher.png`, launcher)
    await write(
      `android/app/src/main/res/${density.dir}/ic_launcher_round.png`,
      round
    )
    await write(
      `android/app/src/main/res/${density.dir}/ic_launcher_foreground.png`,
      foreground
    )
  }

  console.log('\nSelesai. Jalankan `npm run build` untuk memakai ikon baru di web.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
