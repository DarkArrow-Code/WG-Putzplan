import { useState, useEffect, useCallback } from 'react'
import { KeyRound, Mail, Copy, Check, RefreshCw } from 'lucide-react'
import { authFetch } from '../api'

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard not available (e.g. http) – code is still visible
    }
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl transition-colors"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Kopiert' : 'Kopieren'}
    </button>
  )
}

function formatCode(code) {
  // 123456 -> "123 456" for easier reading
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

export default function MailCode() {
  const [data, setData] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/wg-code')
      if (!res.ok) throw new Error('Code konnte nicht geladen werden')
      const json = await res.json()
      setData(json)
      setExpiresAt(json.totp ? Date.now() + json.totp.remaining * 1000 : null)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  // Load every 10 s (new mail codes) and tick once per second for the countdown
  useEffect(() => {
    let lastLoad = 0
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t - lastLoad >= 10000) {
        lastLoad = t
        load()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [load])

  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null

  // Current TOTP expired -> fetch the next one right away
  useEffect(() => {
    if (expiresAt && now >= expiresAt) {
      const id = setTimeout(load, 0)
      return () => clearTimeout(id)
    }
  }, [now, expiresAt, load])

  const mailAgeMinutes = data?.mail
    ? Math.max(0, Math.round((now - new Date(data.mail.received_at.replace(' ', 'T') + 'Z').getTime()) / 60000))
    : null

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">WG-Mail Code</h1>
        <p className="text-slate-500 mt-1">Sicherheitscode für das gemeinsame Outlook-Konto.</p>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 mb-6">{error}</div>
      )}

      {!data && !error && (
        <div className="flex justify-center p-12">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-slate-800">
              <KeyRound className="w-5 h-5 text-blue-600" /> Authenticator-Code
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Beim Login „Code aus Authenticator-App verwenden“ wählen.
            </p>

            {data.totp ? (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span className="text-4xl font-mono font-bold tracking-wider text-slate-900">
                    {formatCode(data.totp.code)}
                  </span>
                  <CopyButton value={data.totp.code} />
                </div>
                <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${remaining <= 5 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${((remaining ?? 0) / data.totp.period) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">Noch {remaining} s gültig, danach kommt automatisch ein neuer.</p>
              </>
            ) : (
              <p className="text-slate-500 italic">
                {data.totpError
                  ? `Fehler: ${data.totpError}`
                  : 'Noch nicht eingerichtet (WG_TOTP_SECRET fehlt).'}
              </p>
            )}
          </section>

          <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-slate-800">
              <Mail className="w-5 h-5 text-blue-600" /> Code per Mail
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Falls Microsoft einen Code per Mail schickt, erscheint er hier (max. {data.mailMaxAgeMinutes} Min. alt).
            </p>

            {data.mail ? (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span className="text-4xl font-mono font-bold tracking-wider text-slate-900">
                    {data.mail.code}
                  </span>
                  <CopyButton value={data.mail.code} />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Empfangen vor {mailAgeMinutes} Min.
                </p>
              </>
            ) : (
              <p className="text-slate-500 italic">Gerade kein aktueller Code. Seite aktualisiert sich alle 10 s.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
