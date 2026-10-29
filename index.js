// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/**
 * Full-pipeline orchestrator.
 * To run individual steps, use: npm run <step>  (see package.json scripts)
 */
import { writeFile } from 'node:fs/promises'
import { RESULT_PATH } from './src/config.js'
import { log, parseArgs } from './src/logger.js'
import { writeState } from './src/state.js'
import { validateManifest } from './src/validate.js'
import { packZip } from './src/pack.js'
import { getAccessToken, getValidToken } from './src/auth.js'
import { getUploadToken, uploadZip } from './src/upload.js'
import { submitTask } from './src/submit.js'
import { pollStatus } from './src/poll.js'

const args = parseArgs()
const RESUME_TASK_CODE = args['task-code'] ?? null

// ─── Step 0: Environment variables ───────────────────────────────────────────
log(0, 'Loading environment variables')
const APP_KEY = process.env.REALSEE_APP_KEY
const APP_SECRET = process.env.REALSEE_APP_SECRET
if (!APP_KEY || !APP_SECRET) {
  console.error('[ERROR] Missing REALSEE_APP_KEY or REALSEE_APP_SECRET. Copy .env.example to .env and fill in your credentials.')
  process.exit(1)
}
log(0, `APP_KEY=${APP_KEY.slice(0, 4)}*** loaded`)

let manifest, uploadResult, taskCode

if (!RESUME_TASK_CODE) {
  // ─── Step 1: Validate ────────────────────────────────────────────────────
  manifest = await validateManifest()

  // ─── Step 2: Pack (manifest.json at root, images under images/) ──────────
  const { projectName } = await packZip(manifest)
  manifest = { ...manifest, project_name: projectName }
}

// ─── Step 3: Auth ─────────────────────────────────────────────────────────
await getAccessToken()

if (!RESUME_TASK_CODE) {
  // ─── Step 4: Upload token ─────────────────────────────────────────────
  const uploadToken = await getUploadToken(await getValidToken())

  // ─── Step 5: Upload ───────────────────────────────────────────────────
  uploadResult = await uploadZip(uploadToken)

  // ─── Step 6: Submit ───────────────────────────────────────────────────
  taskCode = await submitTask(await getValidToken(), {
    uploadPath: uploadResult.path,
    downloadUrl: uploadResult.download_url,
    projectName: manifest.project_name,
  })
  await writeState({ task_code: taskCode, project_name: manifest.project_name })
} else {
  log(0, `--task-code mode: skipping Steps 1–6, resuming poll for task_code=${RESUME_TASK_CODE}`)
  taskCode = RESUME_TASK_CODE
}

// ─── Step 7: Poll ─────────────────────────────────────────────────────────
const vrUrl = await pollStatus(null, taskCode)

// ─── Step 8: Write result ─────────────────────────────────────────────────
log(8, 'Writing final result')
const result = {
  timestamp: new Date().toISOString(),
  project_name: manifest?.project_name,
  task_code: taskCode,
  vr_url: vrUrl,
  upload_path: uploadResult?.path,
  download_url: uploadResult?.download_url,
}
await writeFile(RESULT_PATH, JSON.stringify(result, null, 2), 'utf-8')
await writeState({ vr_url: vrUrl })
log(8, `Result written to ${RESULT_PATH}`)

console.log('\n========================================')
console.log('  VR URL:', vrUrl)
console.log('========================================\n')
