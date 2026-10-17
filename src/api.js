// Fetch helper that sends the login token and logs out on expired sessions

export function getToken() {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  } catch {
    // ignore
  }
}

export async function authFetch(url, options = {}) {
  const token = getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
  if (res.status === 401) {
    clearSession()
    window.location.href = '/login'
  }
  return res
}
