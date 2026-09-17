import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, X, Shield } from 'lucide-react'

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <>
      <header className="navbar">
        <Link to="/" className="navbar-logo" aria-label="TrustGate Homepage">
          <div className="logo-mark">
            <Shield size={16} strokeWidth={2.5} />
          </div>
          <span className="logo-text">TrustGate</span>
        </Link>

        {/* Desktop Navigation Links — quiet text links, no filled button per spec */}
        <nav className="navbar-links">
          <NavLink to="/verify" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
            Verify
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/metrics" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
            Metrics
          </NavLink>
          <NavLink to="/demo" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
            Live Demo
          </NavLink>
        </nav>

        {/* Mobile Hamburger */}
        <div className="navbar-mobile-actions">
          <button
            type="button"
            className="navbar-hamburger"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>
                <Shield size={16} />
                <span>TrustGate</span>
              </div>
              <button
                type="button"
                className="navbar-hamburger"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mobile-drawer-links">
              <NavLink to="/" end className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
                Overview
              </NavLink>
              <NavLink to="/verify" className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
                Verify
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
                Dashboard
              </NavLink>
              <NavLink to="/metrics" className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
                Metrics
              </NavLink>
              <NavLink to="/demo" className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
                Live Demo
              </NavLink>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
