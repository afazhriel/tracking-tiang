'use client'

import { Capacitor } from '@capacitor/core'

let Camera = null
let Geolocation = null
let StatusBar = null
let SplashScreen = null
let Keyboard = null
let PushNotifications = null
let LocalNotifications = null
let App = null

async function loadPlugins() {
  if (typeof window === 'undefined') return

  try {
    if (Capacitor.isNativePlatform()) {
      const [
        { Camera: Cam },
        { Geolocation: Geo },
        { StatusBar: SB },
        { SplashScreen: SS },
        { Keyboard: KB },
        { PushNotifications: PN },
        { LocalNotifications: LN },
        { App: AppPlugin },
      ] = await Promise.all([
        import('@capacitor/camera'),
        import('@capacitor/geolocation'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/keyboard'),
        import('@capacitor/push-notifications'),
        import('@capacitor/local-notifications'),
        import('@capacitor/app'),
      ])

      Camera = Cam
      Geolocation = Geo
      StatusBar = SB
      SplashScreen = SS
      Keyboard = KB
      PushNotifications = PN
      LocalNotifications = LN
      App = AppPlugin
    }
  } catch (error) {
    console.warn('Capacitor plugins not available:', error)
  }
}

if (typeof window !== 'undefined') {
  loadPlugins()
}

export async function takePhoto(options = {}) {
  if (!Camera) {
    throw new Error('Camera plugin not available')
  }

  return Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: 'base64',
    source: 'camera',
    saveToGallery: false,
    ...options,
  })
}

export async function pickPhoto(options = {}) {
  if (!Camera) {
    throw new Error('Camera plugin not available')
  }

  return Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: 'base64',
    source: 'photos',
    ...options,
  })
}

export async function getCurrentPosition(options = {}) {
  if (!Geolocation) {
    throw new Error('Geolocation plugin not available')
  }

  return Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
    ...options,
  })
}

export async function watchPosition(callback, options = {}) {
  if (!Geolocation) {
    throw new Error('Geolocation plugin not available')
  }

  return Geolocation.watchPosition(
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      ...options,
    },
    callback
  )
}

export async function clearWatch(watchId) {
  if (!Geolocation) return
  return Geolocation.clearWatch({ id: watchId })
}

export async function configureStatusBar() {
  if (!StatusBar) return

  await StatusBar.setStyle({ style: 'Dark' })
  await StatusBar.setBackgroundColor({ color: '#1c1614' })
  await StatusBar.setOverlaysWebView({ overlay: false })
}

export async function showSplashScreen() {
  if (!SplashScreen) return
  await SplashScreen.show()
}

export async function hideSplashScreen() {
  if (!SplashScreen) return
  await SplashScreen.hide()
}

export async function setKeyboardResize(mode = 'body') {
  if (!Keyboard) return
  await Keyboard.setResizeMode({ mode })
}

export async function registerPushNotifications() {
  if (!PushNotifications) return

  const permResult = await PushNotifications.requestPermissions()
  if (permResult.receive === 'granted') {
    await PushNotifications.register()
  }
  return permResult
}

export async function addPushListener(event, callback) {
  if (!PushNotifications) return
  return PushNotifications.addListener(event, callback)
}

export async function removePushListeners() {
  if (!PushNotifications) return
  await PushNotifications.removeAllListeners()
}

export async function scheduleLocalNotification(notification) {
  if (!LocalNotifications) return

  await LocalNotifications.requestPermissions()
  return LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now(),
        title: notification.title,
        body: notification.body,
        extra: notification.extra,
        schedule: notification.schedule ? { at: new Date(notification.schedule) } : undefined,
        sound: notification.sound ?? 'default',
        attachments: notification.attachments,
        actionTypeId: notification.actionTypeId,
      },
    ],
  })
}

export async function cancelLocalNotification(id) {
  if (!LocalNotifications) return
  return LocalNotifications.cancel({ notifications: [{ id }] })
}

/**
 * Tombol back perangkat (Android).
 *
 * `MainActivity.onBackPressed` bawaan Capacitor sudah mengurus
 * kembali-in-riwayat. Yang belum tertangani: menutup drawer/overlay
 * yang sedang terbuka, dan keluar dari aplikasi dengan rapi.
 *
 * Listener ini opsional — memanggil `addListener` lebih dari sekali
 * menghasilkan listener ganda, jadi hanya dipasang lewat helper
 * `onBackButton` yang idempoten di sisi pemanggil.
 */
export async function addBackButtonListener(callback) {
  if (!App) return null
  return App.addListener('backButton', callback)
}

export async function exitApp() {
  if (!App) return
  return App.exitApp()
}

/** Buka halaman pengaturan aplikasi (mis. setelah izin ditolak). */
export async function openAppSettings() {
  if (!App) return
  return App.openSettings()
}

export function isNative() {
  return Capacitor.isNativePlatform()
}

export function getPlatform() {
  return Capacitor.getPlatform()
}