import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, UserPlus, Sparkles } from 'lucide-react'

export default function Login({ setUser }) {
  const [users, setUsers] = useState([])
  const [isRegistering, setIsRegistering] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const [newName, setNewName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [floor, setFloor] = useState('EG')
  const navigate = useNavigate()

  const fetchUsers = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        // Filter out placeholder users that are not set up yet
        const activeUsers = data.filter(u => u.is_setup === 1 || u.is_setup === true)
        setUsers(activeUsers)
        if (activeUsers.length === 0) {
          setIsRegistering(true)
        }
      })
      .catch(err => console.error("Failed to load users", err))
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const selectedUser = users.find(u => u.name === selectedName)
  // If the user somehow exists but is not setup, it will act like a login but set the password.
  // Actually, we removed dummy users, so every user in the DB is fully setup via registration.
  const isFirstLogin = selectedUser && !selectedUser.is_setup

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isRegistering) {
      if (!newName || !password) {
        setError('Bitte gib einen Namen und ein Passwort ein.')
        return
      }
    } else {
      if (!selectedName || !password) {
        setError('Bitte wähle deinen Namen und gib ein Passwort ein.')
        return
      }
    }

    setIsLoading(true)
    setError('')

    const url = isRegistering ? '/api/register' : '/api/login'
    const bodyPayload = isRegistering 
      ? { name: newName, password, floor } 
      : { name: selectedName, password }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      })

      let data = {}
      const text = await res.text()
      try {
        if (text) {
          data = JSON.parse(text)
        }
      } catch (e) {
        console.error("Failed to parse response JSON", e)
      }

      if (!res.ok) {
        throw new Error(data.error || text || 'Fehler aufgetreten')
      }

      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon-wrapper">
            <Sparkles className="login-icon" />
          </div>
          <h1 className="login-title">WG Putzplan</h1>
          <p className="login-subtitle">
            {isRegistering ? 'Neuen Mitbewohner anlegen' : 'Willkommen zurück! Bitte logge dich ein.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          {isRegistering ? (
            <div className="space-y-6">
              <div>
                <label className="login-label">Dein Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setError('')
                  }}
                  className="login-input"
                  placeholder="Name eingeben..."
                />
              </div>
              <div>
                <label className="login-label">Dein Stockwerk</label>
                <select
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className="login-select"
                >
                  <option value="EG">Erdgeschoss (EG)</option>
                  <option value="OG1">1. Obergeschoss (OG1)</option>
                  <option value="OG2">2. Obergeschoss (OG2)</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="login-label">Dein Name</label>
              <select
                value={selectedName}
                onChange={(e) => {
                  setSelectedName(e.target.value)
                  setPassword('')
                  setError('')
                }}
                className="login-select"
              >
                <option value="">Bitte wählen...</option>
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {(selectedName || isRegistering) && (
            <div>
              <label className="login-label">
                {isRegistering ? 'Setze ein Passwort' : 'Dein Passwort'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                placeholder="Passwort..."
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || (isRegistering ? (!newName || !password) : (!selectedName || !password))}
            className="login-btn"
          >
            {isLoading ? (
              <div className="login-spinner" />
            ) : (
              <>
                {isRegistering ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                {isRegistering ? 'Mitbewohner anlegen' : 'Einloggen'}
              </>
            )}
          </button>
        </form>

        {users.length < 5 && (
          <div className="login-toggle-wrapper">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering)
                setError('')
                setPassword('')
              }}
              className="login-toggle-btn"
            >
              {isRegistering ? 'Zurück zum Login' : `Noch Platz in der WG? Neu registrieren (${users.length}/5 belegt)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
