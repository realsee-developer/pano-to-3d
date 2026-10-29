// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { fileURLToPath } from 'node:url'
import { BASE_URL } from './config.js'
import { log, apiFetch } from './logger.js'
import { writeState } from './state.js'

const STEP = 3
const REFRESH_BEFORE_EXPIRE_MS = 10_000

/** Module-level token cache */
let _token = null
let _expireAt = 0  // Unix timestamp (seconds)

/**
 * Unconditionally fetches a new access_token from the server and updates the cache.
 * @returns {Promise<string>} access_token
 */
export async function getAccessToken() {
  const APP_KEY = process.env.REALSEE_APP_KEY
  const APP_SECRET = process.env.REALSEE_APP_SECRET
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('Missing env vars REALSEE_APP_KEY or REALSEE_APP_SECRET')
  }

  log(STEP, `POST ${BASE_URL}/auth/access_token`)
  const json = await apiFetch(STEP, 'POST', `${BASE_URL}/auth/access_token`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ app_key: APP_KEY, app_secret: APP_SECRET }),
    bodyType: 'form',
  })
  if (json.code !== 0) throw new Error(`Failed to obtain access_token: ${json.status}`)

  const { access_token, expire_at } = json.data
  _token = access_token
  _expireAt = expire_at
  const remainMs = expire_at * 1000 - Date.now()
  log(STEP, `access_token obtained, expire_at=${expire_at} (expires in ${(remainMs / 1000).toFixed(0)}s)`)
  return access_token
}

/**
 * Returns a valid access_token, auto-refreshing if expiry is within 10s.
 * Equivalent to getAccessToken() on first call (no cached token).
 * @returns {Promise<string>} access_token
 */
export async function getValidToken() {
  const nowMs = Date.now()
  const expiresInMs = _expireAt * 1000 - nowMs

  if (_token && expiresInMs > REFRESH_BEFORE_EXPIRE_MS) {
    return _token
  }

  if (_token) {
    log(STEP, `access_token expiring soon (${(expiresInMs / 1000).toFixed(0)}s ≤ ${REFRESH_BEFORE_EXPIRE_MS / 1000}s), refreshing`)
  }
  return getAccessToken()
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const accessToken = await getAccessToken()
  await writeState({ access_token: accessToken })
  log(STEP, 'Written to state.json: access_token')
}
