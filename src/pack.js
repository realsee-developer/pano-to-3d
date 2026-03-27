import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zip } from 'fflate'
import { SAMPLES_DIR, OUTPUT_DIR, ZIP_PATH } from './config.js'
import { log } from './logger.js'
import { validateManifest } from './validate.js'

const STEP = 2

/**
 * Packs manifest.json (with {{timestamp}} replaced) and all panoramas into a ZIP.
 * manifest.json is placed at the root; images go under images/.
 * @param {object} manifest - Parsed manifest object (project_name may contain {{timestamp}})
 * @returns {Promise<{ zipPath: string, projectName: string }>}
 */
export async function packZip(manifest) {
  const timestamp = Date.now()
  const projectName = manifest.project_name.replace('{{timestamp}}', timestamp)
  log(STEP, `Packing ZIP — project_name="${projectName}", manifest.json at root, images under images/`)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const packedManifest = { ...manifest, project_name: projectName }
  const fileEntries = {}
  fileEntries['manifest.json'] = new TextEncoder().encode(JSON.stringify(packedManifest, null, 2))
  for (const { id } of manifest.scan_list) {
    fileEntries[`images/${id}.jpg`] = new Uint8Array(
      await readFile(resolve(SAMPLES_DIR, 'images', `${id}.jpg`))
    )
  }

  const zipped = await new Promise((resolve, reject) =>
    zip(fileEntries, (err, data) => (err ? reject(err) : resolve(data)))
  )
  await writeFile(ZIP_PATH, zipped)

  const sizeMB = (zipped.byteLength / 1024 / 1024).toFixed(2)
  log(STEP, `ZIP packed — ${Object.keys(fileEntries).length} files, ${sizeMB} MB → ${ZIP_PATH}`)
  return { zipPath: ZIP_PATH, projectName }
}

// ── Standalone run ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await validateManifest()
  const { projectName } = await packZip(manifest)
  const { writeState } = await import('./state.js')
  await writeState({ project_name: projectName })
  log(STEP, `Written to state.json: project_name="${projectName}"`)
}
