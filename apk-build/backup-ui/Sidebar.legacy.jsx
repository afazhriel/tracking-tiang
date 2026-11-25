'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const MENU = [
  {
    label: 'OVERVIEW',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'PROJECT',
    items: [
      { id: 'tiang', label: 'Tiang', icon: MapPin },
      { id: 'pekerjaan', label: 'Pekerjaan', icon: ClipboardList },
      { id: 'kurva-s', label: 'Kurva S', icon: BarChart3 },
    ],
  },
  {
    label: 'MONITORING',
    items: [{ id: 'aktivitas', label: 'Aktivitas', icon: Activity }],
  },
]

function Brand({ collapsed }) {
  return (
    <div className="pcr-brand">
      <span className="pcr-brand-mark" aria-hidden="true">
        <MapPin size={16} strokeWidth={2.2} />
      </span>

      {!collapsed && (
        <div className="pcr-brand-text">
          <strong>TRACKING TIANG</strong>
          <span>PROJECT CONTROL</span>
        </div>
      )}
    </div>
  )
}

function NavList({ activeSection, onNavigate }) {
  return (
    <>
      {MENU.map((group) => (
        <div className="pcr-nav-group" key={group.label}>
          <div className="pcr-nav-label">{group.label}</div>

          <div className="pcr-nav-items">
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id

              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => onNavigate?.(item.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`pcr-nav-link${isActive ? ' is-active' : ''}`}
                  title={item.label}
                >
                  <Icon size={17} strokeWidth={1.9} />

                  <span className="pcr-nav-text">{item.label}</span>
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

function UserBlock({ collapsed, onLogout }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tracking_tiang_user')

      setUser(raw ? JSON.parse(raw) : null)
    } catch {
      setUser(null)
    }
  }, [])

  const name = user?.name || user?.nama || 'Administrator'
  const role = user?.role?.name || user?.role || 'Project Control'
  const initial = String(name).trim().charAt(0) || 'T'

  return (
    <>
      <div className="pcr-user">
        <span className="pcr-user-avatar" aria-hidden="true">
          {initial}
        </span>

        {!collapsed && (
          <div className="pcr-user-meta">
            <strong>{name}</strong>
            <span>{role}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className="pcr-logout"
        onClick={onLogout}
        aria-label="Logout"
        title="Logout"
      >
        <LogOut size={15} strokeWidth={1.9} />
      </button>
    </>
  )
}

function CollapseButton({ collapsed, onToggle }) {
  return (
    <button
      type="button"
      className="pcr-nav-toggle"
      onClick={onToggle}
      aria-label={collapsed ? 'Perlebar sidebar' : 'Perkecil sidebar'}
      title={collapsed ? 'Perlebar sidebar' : 'Perkecil sidebar'}
    >
      {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}

      <span>{collapsed ? '' : 'Perkecil sidebar'}</span>
    </button>
  )
}

export default function Sidebar({
  navCollapsed,
  onToggleNav,
  mobileOpen,
  onToggleMobile,
  activeSection,
}) {
  const router = useRouter()

  function handleLogout() {
    try {
      localStorage.removeItem('tracking_tiang_token')
      localStorage.removeItem('tracking_tiang_user')
    } catch {
      /* storage tidak tersedia — abaikan */
    }

    onToggleMobile?.(false)

    router.replace('/login')

    window.location.href = '/login'
  }

  return (
    <>
      <nav className="pcr-nav" aria-label="Navigasi utama">
        <aside className="pcr-sidebar">
          <Brand collapsed={navCollapsed} />

          <div className="pcr-nav-scroll">
            <NavList activeSection={activeSection} />
          </div>

          <div className="pcr-nav-foot">
            <UserBlock collapsed={navCollapsed} onLogout={handleLogout} />

            <CollapseButton
              collapsed={navCollapsed}
              onToggle={onToggleNav}
            />
          </div>
        </aside>
      </nav>

      <div className="pcr-mobilebar">
        <button
          type="button"
          className="pcr-iconbtn"
          onClick={() => onToggleMobile?.(true)}
          aria-label="Buka menu"
        >
          <Menu size={18} />
        </button>

        <strong>Tracking Tiang</strong>

        <button
          type="button"
          className="pcr-iconbtn"
          onClick={handleLogout}
          aria-label="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="pcr-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => onToggleMobile?.(false)}
            />

            <motion.nav
              className="pcr-nav pcr-nav--drawer"
              aria-label="Navigasi utama"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ width: 268 }}
            >
              <aside className="pcr-sidebar">
                <div className="pcr-brand">
                  <span className="pcr-brand-mark" aria-hidden="true">
                    <MapPin size={16} strokeWidth={2.2} />
                  </span>

                  <div className="pcr-brand-text">
                    <strong>TRACKING TIANG</strong>
                    <span>PROJECT CONTROL</span>
                  </div>

                  <button
                    type="button"
                    className="pcr-closebtn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => onToggleMobile?.(false)}
                    aria-label="Tutup menu"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="pcr-nav-scroll">
                  <NavList
                    activeSection={activeSection}
                    onNavigate={() => onToggleMobile?.(false)}
                  />
                </div>

                <div className="pcr-nav-foot">
                  <UserBlock collapsed={false} onLogout={handleLogout} />
                </div>
              </aside>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
