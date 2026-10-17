import { useState, useEffect, useCallback } from 'react'
import { Users, UserMinus, UserPlus } from 'lucide-react'
import { authFetch, clearSession } from '../api'

const FLOOR_LABELS = { EG: 'Erdgeschoss', OG1: '1. OG', OG2: '2. OG' }

export default function Roommates({ user, onLogout }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    return fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(() => setError('Mitbewohner konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRemove = async (u) => {
    const isSelf = u.id === user.id
    const question = isSelf
      ? 'Willst du dich wirklich selbst entfernen? Du wirst ausgeloggt und kannst dich danach neu registrieren.'
      : `${u.name} wirklich entfernen?\n\nDer Platz wird frei, ${u.name} kann sich danach neu registrieren (z. B. bei vergessenem Passwort) oder ein neuer Mitbewohner kann einziehen. Offene Aufgaben dieser Woche übernimmt, wer sich auf dem Platz neu anmeldet.`
    if (!confirm(question)) return

    setError('')
    setMessage('')
    const res = await authFetch(`/api/users/${u.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Entfernen fehlgeschlagen')
      return
    }
    if (data.wasSelf) {
      clearSession()
      onLogout()
      return
    }
    setMessage(`${data.removedName} wurde entfernt. Der Platz ist jetzt frei.`)
    load()
  }

  const freeSlots = users.filter(u => !u.is_setup).length

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Mitbewohner</h1>
        <p className="text-slate-500 mt-1">Bei Auszug oder vergessenem Passwort einen Platz freigeben.</p>
      </header>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-4 mb-6">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 rounded-xl p-4 mb-6">{message}</div>}

      <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
          <Users className="w-5 h-5 text-blue-600" /> WG ({users.length - freeSlots}/{users.length} belegt)
        </h2>

        {loading ? (
          <p className="text-slate-500">Lade…</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map(u => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  {u.is_setup ? (
                    <p className="font-medium text-slate-800 truncate">
                      {u.name}
                      {u.id === user.id && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Du</span>
                      )}
                    </p>
                  ) : (
                    <p className="font-medium text-slate-400 italic flex items-center gap-1">
                      <UserPlus className="w-4 h-4" /> Freier Platz
                    </p>
                  )}
                  <p className="text-xs text-slate-400">{FLOOR_LABELS[u.floor] || u.floor}</p>
                </div>
                {u.is_setup ? (
                  <button
                    onClick={() => handleRemove(u)}
                    className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <UserMinus className="w-4 h-4" /> Entfernen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {freeSlots > 0 && !loading && (
          <p className="text-sm text-slate-500 mt-4">
            Neue Mitbewohner registrieren sich auf der Login-Seite über „Neu registrieren“.
          </p>
        )}
      </section>
    </div>
  )
}
