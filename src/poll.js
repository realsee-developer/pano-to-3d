// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { BASE_URL, POLL_INTERVAL_MS, POLL_MAX_ATTEMPTS, RESULT_PATH } from './config.js'
import { log, apiFetch, parseArgs } from './logger.js'
import { readState, writeState } from './state.js'
import { getValidToken, getAccessToken } from './auth.js'

const STEP = 7

/**
 * Polls task status until completion or timeout.
 * Calls getValidToken() before each request (auto-refreshes when near expiry).
 * Falls back to a forced refresh if the server returns code:-3 (clock skew safeguard).
 * @param {string} _initialToken - Unused; kept for signature compatibility
 * @param {string} taskCode
 * @returns {Promise<string>} vr_url
 */
export async function pollStatus(_initialToken, taskCode) {
  log(STEP, `Starting poll — task_code=${taskCode} (interval ${POLL_INTERVAL_MS / 1000}s, max ${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 60000} min)`)

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const waited = ((attempt * POLL_INTERVAL_MS) / 60000).toFixed(1)

    const token = await getValidToken()

    const json = await apiFetch(
      STEP,
      'GET',
      `${BASE_URL}/open/v1/pano/task/status?task_code=${encodeURIComponent(taskCode)}`,
      { headers: { Authorization: token } }
    )

    // Safeguard: if server still returns expired (possible clock skew), force-refresh and retry
    if (json.code === -3) {
      log(STEP, `Received access_token expired (code:-3), force-refreshing and retrying (attempt ${attempt})`)
      const freshToken = await getAccessToken()
      await writeState({ access_token: freshToken })
      const retryJson = await apiFetch(
        STEP,
        'GET',
        `${BASE_URL}/open/v1/pano/task/status?task_code=${encodeURIComponent(taskCode)}`,
        { headers: { Authorization: freshToken } }
      )
      if (retryJson.code !== 0) throw new Error(`Query failed after token refresh: ${retryJson.status}`)
      Object.assign(json, retryJson)
    } else if (json.code !== 0) {
      throw new Error(`Task status query error: ${json.status}`)
    }

    const taskStatus = json.data?.status ?? '(unknown)'
    const projectId = json.data?.project_id ?? ''
    log(STEP, `[Attempt ${attempt}/${POLL_MAX_ATTEMPTS}, waited ${waited} min] project_id=${projectId} status=${taskStatus}`)

    if (/success|complete|done/i.test(String(taskStatus))) {
      const vrUrl = json.data?.vr_url || json.data?.view_url || json.data?.url || ''
      log(STEP, `Task complete! project_id=${projectId} VR URL=${vrUrl}`)
      return vrUrl
    }
    if (/fail|error/i.test(String(taskStatus))) {
      throw new Error(`Task failed — status=${taskStatus}, details=${JSON.stringify(json.data)}`)
    }
  }

  throw new Error(`Polling timed out after ${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 60000} min`)
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs()
  const state = await readState()

  if (!state.access_token) throw new Error('access_token missing from state.json — run "npm run auth" first')

  const taskCode = args['task-code'] ?? state.task_code
  if (!taskCode) throw new Error('Provide task_code via --task-code=xxx or run "npm run submit" first')

  log(STEP, `Using task_code=${taskCode}${args['task-code'] ? ' (from --task-code arg)' : ' (from state.json)'}`)

  const vrUrl = await pollStatus(state.access_token, taskCode)

  const result = { timestamp: new Date().toISOString(), task_code: taskCode, vr_url: vrUrl }
  await writeFile(RESULT_PATH, JSON.stringify(result, null, 2), 'utf-8')
  await writeState({ vr_url: vrUrl })

  console.log('\n========================================')
  console.log('  VR URL:', vrUrl)
  console.log('========================================\n')
}
