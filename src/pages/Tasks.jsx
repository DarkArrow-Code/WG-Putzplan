import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [isEditing, setIsEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [isAdding, setIsAdding] = useState(false)

  const loadTasks = () => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => setTasks(data))
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleSave = async (id, data) => {
    const url = id ? `/api/tasks/${id}` : '/api/tasks'
    const method = id ? 'PUT' : 'POST'
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    setIsEditing(null)
    setIsAdding(false)
    loadTasks()
  }

  const handleDelete = async (id) => {
    if(!confirm('Aufgabe wirklich löschen?')) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    loadTasks()
  }

  const startEdit = (task) => {
    setEditForm(task)
    setIsEditing(task.id)
  }

  const TaskForm = ({ initialData, onSave, onCancel }) => {
    const [formData, setFormData] = useState(initialData || { title: '', description: '', type: 'weekly', default_priority: 5 })
    
    return (
      <div className="task-form-card">
        <div className="form-grid">
          <div>
            <label className="form-label">Titel</label>
            <input 
              type="text" 
              value={formData.title} 
              onChange={e => setFormData({...formData, title: e.target.value})}
              className="form-input"
              placeholder="z.B. Küche putzen"
            />
          </div>
          <div>
            <label className="form-label">Beschreibung</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="form-input"
              rows="2"
            />
          </div>
          <div className="form-grid-2">
            <div>
              <label className="form-label">Typ</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value})}
                className="form-input"
              >
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
              </select>
            </div>
            <div>
              <label className="form-label">Priorität (1 = Sehr wichtig)</label>
              <input 
                type="number" 
                min="1" max="10"
                value={formData.default_priority} 
                onChange={e => setFormData({...formData, default_priority: parseInt(e.target.value)})}
                className="form-input"
              />
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button onClick={onCancel} className="btn-secondary">
            <X className="btn-save-icon" /> Abbrechen
          </button>
          <button onClick={() => onSave(formData)} className="btn-save">
            <Save className="btn-save-icon" /> Speichern
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tasks-container">
      <div className="tasks-header">
        <div>
          <h1 className="tasks-title">Aufgaben verwalten</h1>
          <p className="tasks-subtitle">Hier definierst du die Vorlagen für den Putzplan.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="btn-primary"
        >
          <Plus className="btn-icon" /> Neue Aufgabe
        </button>
      </div>

      {isAdding && (
        <TaskForm onSave={(data) => handleSave(null, data)} onCancel={() => setIsAdding(false)} />
      )}

      <div className="tasks-list">
        {tasks.map(task => (
          isEditing === task.id ? (
            <TaskForm key={task.id} initialData={task} onSave={(data) => handleSave(task.id, data)} onCancel={() => setIsEditing(null)} />
          ) : (
            <div key={task.id} className="task-card group">
              <div>
                <div className="task-card-header">
                  <h3 className="task-card-title">{task.title}</h3>
                  <span className="badge-prio">
                    Prio {task.default_priority}
                  </span>
                  <span className={task.type === 'weekly' ? 'badge-type-weekly' : 'badge-type-monthly'}>
                    {task.type === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
                  </span>
                </div>
                <p className="task-card-desc">{task.description}</p>
              </div>
              <div className="task-card-actions">
                <button onClick={() => startEdit(task)} className="btn-action-edit">
                  <Edit2 className="w-5 h-5" />
                </button>
                <button onClick={() => handleDelete(task.id)} className="btn-action-delete">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
