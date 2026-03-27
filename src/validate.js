import { readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SAMPLES_DIR } from './config.js'
import { log } from './logger.js'

const STEP = 1

/**
 * Validates manifest.json structure and checks that all referenced image files exist.
 * @returns {Promise<object>} Parsed manifest object
 */
export async function validateManifest() {
  log(STEP, 'Validating manifest.json')
  const manifestPath = resolve(SAMPLES_DIR, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

  for (const field of ['version', 'project_name', 'floor_map', 'scan_list']) {
    if (manifest[field] == null) throw new Error(`manifest.json missing required field: ${field}`)
  }
  if (typeof manifest.floor_map !== 'object' || Object.keys(manifest.floor_map).length === 0) {
    throw new Error('manifest.json floor_map must not be empty')
  }
  if (!Array.isArray(manifest.scan_list) || manifest.scan_list.length === 0) {
    throw new Error('manifest.json scan_list must not be empty')
  }
  for (const item of manifest.scan_list) {
    if (!item.id || item.floor == null) {
      throw new Error(`scan_list entry missing id or floor: ${JSON.stringify(item)}`)
    }
    const imgPath = resolve(SAMPLES_DIR, 'images', `${item.id}.jpg`)
    try { await access(imgPath) } catch {
      throw new Error(`Image file not found for id="${item.id}": ${imgPath}`)
    }
  }

  log(STEP, `Validation passed — project_name="${manifest.project_name}", scan_list has ${manifest.scan_list.length} entries`)
  return manifest
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await validateManifest()
}
