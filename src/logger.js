// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export function timestamp() {
  return new Date().toTimeString().slice(0, 8)
}

export function log(step, msg) {
  console.log(`[${timestamp()}] [STEP-${step}]`, msg)
}

export function logDetail(step, label, obj) {
  console.log(`[${timestamp()}] [STEP-${step}] ┌─ ${label}`)
  for (const line of JSON.stringify(obj, null, 2).split('\n')) {
    console.log(`[${timestamp()}] [STEP-${step}] │  ${line}`)
  }
  console.log(`[${timestamp()}] [STEP-${step}] └─`)
}

const MASK_KEYS = ['tmpSecretId', 'tmpSecretKey', 'sessionToken', 'app_secret', 'access_token']

export function maskSensitive(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) =>
    MASK_KEYS.includes(k) && typeof v === 'string' ? `${v.slice(0, 6)}***` : v
  ))
}

export async function apiFetch(step, method, url, { headers = {}, body, bodyType } = {}) {
  const reqLog = { method, url, headers: { ...headers }, body: undefined }
  if (body) {
    reqLog.body = bodyType === 'form'
      ? Object.fromEntries(new URLSearchParams(body))
      : JSON.parse(body)
  }
  if (reqLog.body?.app_secret) {
    reqLog.body = { ...reqLog.body, app_secret: `${reqLog.body.app_secret.slice(0, 4)}***` }
  }
  if (reqLog.headers?.Authorization) {
    reqLog.headers.Authorization = `${String(reqLog.headers.Authorization).slice(0, 10)}***`
  }
  logDetail(step, `→ REQUEST  ${method} ${url}`, reqLog)

  const res = await fetch(url, { method, headers, body })
  const json = await res.json()
  logDetail(step, `← RESPONSE ${res.status} ${url}`, maskSensitive(json))
  return json
}

export function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true] })
  )
}
