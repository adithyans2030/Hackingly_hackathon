import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, X, Layers } from 'lucide-react'

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Scroll-aware frosted glass transition
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header className={`navbar${scrolled ? ' scrolled' : ''}`} role="banner">
        <Link to="/" className="navbar-logo" aria-label="BrickWall Homepage">
          {/* Brick-themed logo mark */}
          <div className="logo-mark" aria-hidden="true">
            <Layers size={16} strokeWidth={2.5} />
          </div>
          <span className="logo-text">BrickWall</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="navbar-links" aria-label="Main navigation">
          <NavLink to="/verify"    className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>Verify</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/metrics"   className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>Metrics</NavLink>
          <NavLink to="/demo"      className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>Live Demo</NavLink>
        </nav>

        {/* Desktop CTA */}
        <div className="navbar-links" style={{ marginLeft: 'auto', gap: 16 }}>
          <Link to="/verify" className="navbar-cta" id="navbar-cta-verify">
            Verify an ID →
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <div className="navbar-mobile-actions">
          <button
            type="button"
            className="navbar-hamburger"
            onClick={() => setMobileOpen(prev => !prev)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <div
            id="mobile-nav"
            className="mobile-drawer"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Mobile navigation"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '1rem', color: '#fdf0e8' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 4,
                  background: 'linear-gradient(135deg, #B5451B, #E8924A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Layers size={14} strokeWidth={2.5} color="#fff" />
                </div>
                <span>BrickWall</span>
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

            <nav className="mobile-drawer-links" aria-label="Mobile navigation">
              <NavLink to="/"          end className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>Overview</NavLink>
              <NavLink to="/verify"    className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>Verify</NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
              <NavLink to="/metrics"   className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>Metrics</NavLink>
              <NavLink to="/demo"      className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>Live Demo</NavLink>
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: 24 }}>
              <Link
                to="/verify"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #B5451B, #C9613A)',
                  color: '#fff',
                  fontWeight: 700,
                  borderRadius: 4,
                  textDecoration: 'none',
                  fontSize: '0.92rem',
                }}
              >
                Verify an ID →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
