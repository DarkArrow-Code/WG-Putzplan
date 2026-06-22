import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

export default function Dashboard({ user, setUser }) {
  const [assignments, setAssignments] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const loadAssignments = async () => {
    setIsLoading(true)
    // Attempt to fetch current week assignments
    const res = await fetch('/api/assignments')
    let data = await res.json()
    
    // If no assignments exist yet for this week, generate them
    if (data.length === 0) {
      await fetch('/api/assignments/generate', { method: 'POST' })
      const res2 = await fetch('/api/assignments')
      data = await res2.json()
    }
    
    setAssignments(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadAssignments()
  }, [])

  const handleComplete = async (id) => {
    await fetch(`/api/assignments/${id}/complete`, { method: 'POST' })
    loadAssignments()
  }

  const handleReassign = async () => {
    if(!confirm('Bist du sicher? Deine Aufgabe wird abgegeben und die unwichtigste Aufgabe der Woche entfällt.')) return
    
    await fetch('/api/assignments/reassign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id })
    })
    loadAssignments()
  }

  const myAssignments = assignments.filter(a => a.user_id === user.id)

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Hallo, {user.name} 👋</h1>
        <p className="dashboard-subtitle">Hier ist der Putzplan für diese Woche.</p>
      </header>

      {isLoading ? (
        <div className="loading-spinner-wrapper">
          <RefreshCw className="loading-spinner" />
        </div>
      ) : (
        <>
          <section className="section-mb">
            <div className="section-header">
              <h2 className="section-title">
                {myAssignments.length > 1 ? 'Deine aktuellen Aufgaben' : 'Deine aktuelle Aufgabe'}
              </h2>
              {myAssignments.some(a => a.status !== 'completed') && (
                <button onClick={handleReassign} className="btn-danger-outline">
                  <AlertCircle className="w-4 h-4" /> Spontan abwesend
                </button>
              )}
            </div>

            {myAssignments.length === 0 ? (
              <div className="empty-task-card">
                <p className="empty-task-title">Du hast diese Woche keine Aufgabe!</p>
                <p className="empty-task-subtitle">Entweder bist du abwesend oder es gab keine Aufgaben für dich.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {myAssignments.map(assignment => (
                  <div key={assignment.id} className={`hero-card ${assignment.status === 'completed' ? 'completed' : 'pending'}`}>
                    <div className="hero-bg-icon">
                      <CheckCircle2 className="w-48 h-48" />
                    </div>
                    <div className="hero-content">
                      <div className="hero-badge">
                        <span className={`hero-badge-dot ${assignment.status === 'completed' ? 'completed' : 'pending'}`}></span>
                        {assignment.type === 'monthly' ? 'Monatsaufgabe' : `Prio ${assignment.current_priority}`}
                      </div>
                      <h3 className="hero-task-title">{assignment.title}</h3>
                      <p className="hero-task-desc">
                        {assignment.description}
                      </p>
                      
                      <div className="hero-actions">
                        {assignment.status === 'completed' ? (
                          <div className="hero-btn-completed">
                            <CheckCircle2 className="w-5 h-5" /> Erledigt
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleComplete(assignment.id)}
                            className="hero-btn-complete"
                          >
                            Aufgabe erledigt!
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-title mb-4">Gesamter Wochenplan</h2>
            <div className="tasks-grid">
              {assignments.length === 0 ? (
                <p className="text-slate-500 col-span-2">Keine Aufgaben für diese Woche generiert.</p>
              ) : (
                assignments.map(task => (
                  <div key={task.id} className={`other-task-card ${task.user_id === user.id ? 'active-user' : ''} ${task.status === 'completed' ? 'completed' : 'pending'}`}>
                    <div>
                      <p className="other-task-user">
                        {task.user_name}
                        {task.user_id === user.id && <span className="user-badge">Du</span>}
                        {task.type === 'monthly' && <span className="monthly-badge ml-2">Monatlich</span>}
                      </p>
                      <p className="other-task-title">{task.title} <span className="other-task-prio">({task.type === 'monthly' ? 'Monatsaufgabe' : `Prio ${task.current_priority}`})</span></p>
                    </div>
                    {task.status === 'completed' ? (
                      <div className="status-icon-completed">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="status-icon-pending">
                        <div className="status-dot" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
