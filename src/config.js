// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Region: global (overseas) | cn (China mainland)
 * Controlled by REALSEE_REGION in .env. Defaults to "global".
 */
export const REGION = (process.env.REALSEE_REGION ?? 'global').trim().toLowerCase()

const BASE_URL_MAP = {
  global: 'https://app-gateway.realsee.ai',
  cn:     'https://app-gateway.realsee.cn',
}
if (!BASE_URL_MAP[REGION]) {
  throw new Error(`Invalid REALSEE_REGION: "${REGION}". Allowed values: global | cn`)
}
export const BASE_URL = BASE_URL_MAP[REGION]
export const SAMPLES_DIR = resolve(__dirname, '../data/samples')
export const OUTPUT_DIR = resolve(__dirname, '../data/output')
export const ZIP_PATH = resolve(OUTPUT_DIR, 'upload.zip')
export const STATE_PATH = resolve(OUTPUT_DIR, 'state.json')
export const RESULT_PATH = resolve(OUTPUT_DIR, 'result.json')
export const POLL_INTERVAL_MS = 30_000
export const POLL_MAX_ATTEMPTS = 60 // 最长轮询 30min
