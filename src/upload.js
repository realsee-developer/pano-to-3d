// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { openAsBlob } from 'node:fs'
import { fileURLToPath } from 'node:url'
import uploaderPkg from '@realsee/universal-uploader'
import { BASE_URL, ZIP_PATH, REGION } from './config.js'
import { log, logDetail, apiFetch, maskSensitive } from './logger.js'
import { readState, writeState } from './state.js'
import { getValidToken } from './auth.js'

const { Uploader } = uploaderPkg

// global: AWS S3 adaptor; cn: Tencent Cloud COS Node.js adaptor
const adaptorPkg = REGION === 'cn'
  ? await import('@realsee/universal-uploader/adaptors/cos-node')
  : await import('@realsee/universal-uploader/adaptors/aws')
const Adaptor = adaptorPkg.default

const STEP_TOKEN = 4
const STEP_UPLOAD = 5

/**
 * Fetches temporary S3/COS upload credentials.
 * @param {string} accessToken
 * @returns {Promise<object>} UploadToken
 */
export async function getUploadToken(accessToken) {
  log(STEP_TOKEN, `GET ${BASE_URL}/open/v1/pano/file/token`)
  const json = await apiFetch(STEP_TOKEN, 'GET', `${BASE_URL}/open/v1/pano/file/token`, {
    headers: { Authorization: accessToken },
  })
  if (json.code !== 0) throw new Error(`Failed to get upload token: ${json.status}`)

  const token = json.data
  log(STEP_TOKEN, `Upload token obtained — bucket=${token.bucket} region=${token.region}`)
  logDetail(STEP_TOKEN, 'UploadToken (masked)', maskSensitive(token))
  return token
}

/**
 * Uploads the local ZIP to object storage and returns the upload result.
 * @param {object} uploadToken
 * @returns {Promise<import('@realsee/universal-uploader').UploadResult>}
 */
export async function uploadZip(uploadToken) {
  const uploadKey = `pano-to-3d-demo-${Date.now()}.zip`
  log(STEP_UPLOAD, `Starting ZIP upload — key="${uploadKey}"`)

  const blob = await openAsBlob(ZIP_PATH, { type: 'application/zip' })
  const uploader = new Uploader(Adaptor, { getToken: () => uploadToken })

  const result = await uploader.upload(uploadKey, blob, {
    onProgress: ({ transferredParts, totalParts, percentage, partSize }) => {
      const pct = (percentage * 100).toFixed(0)
      const partSizeMB = (partSize / 1024 / 1024).toFixed(0)
      log(STEP_UPLOAD, `Upload progress: ${pct}% — part ${transferredParts}/${totalParts} (${partSizeMB} MB each)`)
    },
  })

  log(STEP_UPLOAD, `Upload complete — download_type=${result.download_type} path=${result.path}`)
  logDetail(STEP_UPLOAD, 'UploadResult', maskSensitive(result))

  if (!result.download_url) {
    log(STEP_UPLOAD, 'download_url is empty (private bucket) — will use private_cos_key when submitting')
  }
  return result
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = await readState()
  if (!state.access_token) throw new Error('access_token missing from state.json — run "npm run auth" first')

  const uploadToken = await getUploadToken(await getValidToken())
  const uploadResult = await uploadZip(uploadToken)

  await writeState({ upload_path: uploadResult.path, download_url: uploadResult.download_url })
  log(STEP_UPLOAD, 'Written to state.json: upload_path, download_url')
}
