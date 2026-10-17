import PostalMime from 'postal-mime'

// Receives mails via Cloudflare Email Routing, extracts the Microsoft
// security code and stores it in the shared D1 database of the Putzplan app.

const DEFAULT_ALLOWED = ['accountprotection.microsoft.com']

export function extractCode(text) {
  if (!text) return null
  // Typical: "Sicherheitscode: 1234567" / "Security code: 123456"
  const labeled = text.match(/(?:sicherheitscode|security code|bestätigungscode|verification code|code)\s*[:\-]?\s*(\d{4,8})\b/i)
  if (labeled) return labeled[1]
  // Fallback: first standalone 6–8 digit number
  const plain = text.match(/(?<![\d.,])\d{6,8}(?![\d.,])/)
  return plain ? plain[0] : null
}

function stripHtml(html) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

function isAllowedSender(from, env) {
  const allowed = (env.ALLOWED_SENDERS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  const list = allowed.length ? allowed : DEFAULT_ALLOWED
  const sender = (from || '').toLowerCase()
  // Entry can be a full address or a domain
  return list.some(entry => sender === entry || sender.endsWith('@' + entry))
}

export default {
  async email(message, env) {
    if (!isAllowedSender(message.from, env)) {
      console.log(`Ignored mail from ${message.from}`)
      message.setReject('Sender not allowed')
      return
    }

    const parsed = await PostalMime.parse(message.raw)
    const text = `${parsed.subject || ''}\n${parsed.text || ''}\n${stripHtml(parsed.html)}`
    const code = extractCode(text)

    if (code) {
      await env.DB.prepare('INSERT INTO security_codes (code, source) VALUES (?, ?)')
        .bind(code, (parsed.subject || 'Mail').slice(0, 120))
        .run()
      console.log('Stored security code')
    } else {
      console.log('No code found in mail:', parsed.subject)
    }

    // Optional: still deliver the original mail to a (verified) address
    if (env.FORWARD_TO) {
      await message.forward(env.FORWARD_TO)
    }
  }
}
