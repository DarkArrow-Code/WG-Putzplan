import { useState, useEffect } from 'react'
import { CheckCircle2, Clock } from 'lucide-react'

export default function Admin() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/logs')
      .then(res => res.json())
      .then(data => {
        setLogs(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch logs', err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6 hidden md:block">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Admin-Bereich</h1>
        <p className="text-slate-500 mt-1">Protokoll aller erledigten Aufgaben (Nur auf PC sichtbar)</p>
      </header>

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          Todo-Log (Letzte 50)
        </h2>

        {loading ? (
          <p className="text-slate-500">Lade Protokoll...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-500 italic">Noch keine Aufgaben erledigt.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 font-semibold text-slate-600">Datum & Uhrzeit</th>
                  <th className="pb-3 font-semibold text-slate-600">Mitbewohner</th>
                  <th className="pb-3 font-semibold text-slate-600">Aufgabe</th>
                  <th className="pb-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(log.completed_at + 'Z').toLocaleString('de-DE')}
                    </td>
                    <td className="py-3 font-medium text-slate-800">
                      {log.user_name}
                    </td>
                    <td className="py-3 text-slate-700">
                      {log.title}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Erledigt
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
