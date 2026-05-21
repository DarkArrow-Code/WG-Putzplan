import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Plus, Trash2, AlertCircle } from 'lucide-react'

export default function Absences({ user }) {
  const [absences, setAbsences] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadAbsences = () => {
    fetch(`/api/absences?user_id=${user.id}`)
      .then(res => res.json())
      .then(data => setAbsences(data))
  }

  useEffect(() => {
    loadAbsences()
  }, [user.id])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!startDate || !endDate) return
    
    setIsSubmitting(true)
    await fetch('/api/absences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, start_date: startDate, end_date: endDate })
    })
    
    setStartDate('')
    setEndDate('')
    setIsSubmitting(false)
    loadAbsences()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eintrag wirklich löschen?')) return
    await fetch(`/api/absences/${id}`, { method: 'DELETE' })
    loadAbsences()
  }

  return (
    <div className="absences-container">
      <header className="absences-header">
        <h1 className="absences-title">Abwesenheiten</h1>
        <p className="absences-subtitle">Trage hier ein, wann du nicht in der WG bist.</p>
      </header>

      <div className="rule-alert">
        <AlertCircle className="rule-icon" />
        <div className="rule-text">
          <strong>Regel:</strong> Wenn du in einer Woche 3 oder mehr Tage abwesend bist, 
          wirst du bei der Aufgabenverteilung für diese Woche automatisch übersprungen.
        </div>
      </div>

      <div className="form-card">
        <h2 className="form-title">
          <CalendarIcon className="form-title-icon" />
          Neue Abwesenheit eintragen
        </h2>
        <form onSubmit={handleAdd} className="form-wrapper">
          <div className="form-group">
            <label className="form-label">Von</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Bis</label>
            <input 
              type="date" 
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting || !startDate || !endDate}
            className="btn-submit"
          >
            <Plus className="w-5 h-5" /> Eintragen
          </button>
        </form>
      </div>

      <div>
        <h3 className="list-title">Deine eingetragenen Abwesenheiten</h3>
        {absences.length === 0 ? (
          <p className="list-empty">Keine Abwesenheiten eingetragen.</p>
        ) : (
          <div className="absences-list">
            {absences.map(abs => (
              <div key={abs.id} className="absence-card">
                <div className="absence-info">
                  <div className="absence-icon-wrapper">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="absence-date">
                      {new Date(abs.start_date).toLocaleDateString('de-DE')} - {new Date(abs.end_date).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(abs.id)}
                  className="btn-delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
