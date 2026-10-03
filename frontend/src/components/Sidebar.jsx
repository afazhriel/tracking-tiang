import { useState } from 'react'
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Menu,
  X,
} from 'lucide-react'

const menuGroups = [
  {
    label: 'OVERVIEW',
    items: [
      {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
      },
    ],
  },
  {
    label: 'PROJECT',
    items: [
      {
        label: 'Tiang',
        icon: MapPin,
        href: '#tiang',
      },
      {
        label: 'Pekerjaan',
        icon: ClipboardList,
        href: '#pekerjaan',
      },
      {
        label: 'Kurva S',
        icon: BarChart3,
        href: '#kurva-s',
      },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      {
        label: 'Aktivitas',
        icon: Activity,
        href: '#aktivitas',
      },
    ],
  },
]

export default function Sidebar() {
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Buka navigasi"
      >
        <Menu size={21} />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          onClick={closeMobile}
          aria-label="Tutup navigasi"
        />
      )}

      <aside
        className={[
          'tracking-sidebar',
          expanded ? 'is-expanded' : 'is-collapsed',
          mobileOpen ? 'is-mobile-open' : '',
        ].join(' ')}
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <span />
            <span />
            <span />
          </div>

          {expanded && (
            <div className="sidebar-brand-copy">
              <strong>TRACKING TIANG</strong>
              <span>PROJECT CONTROL</span>
            </div>
          )}

          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={closeMobile}
            aria-label="Tutup navigasi"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group) => (
            <div className="sidebar-group" key={group.label}>
              {expanded && (
                <div className="sidebar-group-label">
                  {group.label}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    className={[
                      'sidebar-link',
                      item.label === 'Dashboard' ? 'is-active' : '',
                    ].join(' ')}
                    onClick={closeMobile}
                  >
                    <Icon size={19} strokeWidth={1.8} />

                    {expanded && (
                      <span>{item.label}</span>
                    )}
                  </a>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {expanded && (
            <div className="sidebar-project-status">
              <div className="sidebar-status-dot" />

              <div>
                <span>PROJECT ACTIVE</span>
                <strong>TT-001</strong>
              </div>
            </div>
          )}

          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={
              expanded
                ? 'Ciutkan sidebar'
                : 'Lebarkan sidebar'
            }
          >
            {expanded ? (
              <ChevronLeft size={18} />
            ) : (
              <ChevronRight size={18} />
            )}

            {expanded && <span>Ciutkan menu</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
