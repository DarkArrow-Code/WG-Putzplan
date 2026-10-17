import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Absences from './pages/Absences'
import Admin from './pages/Admin'
import MailCode from './pages/MailCode'
import { getToken, clearSession } from './api'

function Navigation({ user, onLogout }) {
  const location = useLocation()
  if (!user || location.pathname === '/login') return null

  return (
    <nav className="nav-container">
      <div className="nav-inner">
        <div className="nav-brand">
          <span className="nav-logo">WG Planer</span>
          <div className="nav-links">
            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
            <Link to="/tasks" className={`nav-link ${location.pathname === '/tasks' ? 'active' : ''}`}>Aufgaben</Link>
            <Link to="/absences" className={`nav-link ${location.pathname === '/absences' ? 'active' : ''}`}>Abwesenheiten</Link>
            <Link to="/mail-code" className={`nav-link ${location.pathname === '/mail-code' ? 'active' : ''}`}>Mail-Code</Link>
          </div>
        </div>
        <button onClick={onLogout} className="nav-logout">Logout</button>
      </div>
    </nav>
  )
}

function App() {
  const [user, setUser] = useState(null)
  
  useEffect(() => {
    // Check if user is logged in (from localStorage for now)
    const storedUser = localStorage.getItem('user')
    if (storedUser && getToken()) {
      setUser(JSON.parse(storedUser))
    } else if (storedUser) {
      // Old login without server token -> log in once again
      clearSession()
    }
  }, [])

  const handleLogout = () => {
    const token = getToken()
    if (token) {
      fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    clearSession()
    setUser(null)
  }

  return (
    <div className="app-container">
      <Navigation user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <Login setUser={setUser} />
        } />
        <Route path="/" element={
          user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/login" replace />
        } />
        <Route path="/tasks" element={
          user ? <Tasks /> : <Navigate to="/login" replace />
        } />
        <Route path="/absences" element={
          user ? <Absences user={user} /> : <Navigate to="/login" replace />
        } />
        <Route path="/mail-code" element={
          user ? <MailCode /> : <Navigate to="/login" replace />
        } />
        <Route path="/admin" element={
          user ? <Admin /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </div>
  )
}

export default App
