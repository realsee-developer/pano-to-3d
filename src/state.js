// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { OUTPUT_DIR, STATE_PATH } from './config.js'

export async function readState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

export async function writeState(patch) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const current = await readState()
  const next = { ...current, ...patch }
  await writeFile(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
