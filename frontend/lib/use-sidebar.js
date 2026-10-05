'use client'

import { createContext, useContext } from 'react'

/**
 * Context sidebar sengaja terpisah dari komponennya.
 *
 * `TemplateSidebar.jsx` selain komponen juga mengekspor hook
 * `useSidebar`. Kalau keduanya berada di satu file, React Fast
 * Refresh tidak bisa menyegarkan state dengan benar saat
 * pengembangan — hook ikut ter-reset setiap kali komponen berubah.
 * Memisahkannya juga menjaga satu file fokus pada markup.
 */
export const SidebarContext = createContext(undefined)

/**
 * Akses state sidebar.
 *
 * `animate: false` dipakai di drawer mobile: panel selalu tampil
 * penuh, tidak ada state terlipat, jadi `expanded` selalu true.
 */
export function useSidebar() {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider')
  }

  return context
}