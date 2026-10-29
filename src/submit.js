// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { fileURLToPath } from 'node:url'
import { BASE_URL } from './config.js'
import { log, apiFetch } from './logger.js'
import { readState, writeState } from './state.js'
import { getValidToken } from './auth.js'

const STEP = 6

/**
 * Submits a VR processing task and returns the task_code.
 * @param {string} accessToken
 * @param {{ uploadPath: string, downloadUrl: string, projectName: string }} opts
 * @returns {Promise<string>} task_code
 */
export async function submitTask(accessToken, { uploadPath, downloadUrl, projectName }) {
  log(STEP, `POST ${BASE_URL}/open/v1/pano/task/submit`)

  // Private bucket: download_url is empty, use private_cos_key (S3 object path) instead
  const body = { project_name: projectName }
  if (downloadUrl) {
    body.zip_cos_url = downloadUrl
  } else {
    body.private_cos_key = uploadPath
  }
  log(STEP, `Submit payload: ${JSON.stringify(body)}`)

  const json = await apiFetch(STEP, 'POST', `${BASE_URL}/open/v1/pano/task/submit`, {
    headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (json.code !== 0) throw new Error(`Failed to submit task: ${json.status}`)

  const taskCode = json.data?.task_code
  log(STEP, `Task submitted — task_code=${taskCode}`)
  return taskCode
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = await readState()
  if (!state.access_token) throw new Error('access_token missing from state.json — run "npm run auth" first')
  if (!state.upload_path) throw new Error('upload_path missing from state.json — run "npm run upload" first')
  if (!state.project_name) throw new Error('project_name missing from state.json — run "npm run pack" first')

  const taskCode = await submitTask(await getValidToken(), {
    uploadPath: state.upload_path,
    downloadUrl: state.download_url,
    projectName: state.project_name,
  })
  await writeState({ task_code: taskCode })
  log(STEP, 'Written to state.json: task_code')
}
