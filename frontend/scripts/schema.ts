/**
 * Genera shared/schema/{trace,run-request}.schema.json a partir del esquema zod y valida
 * todos los ejemplos de shared/examples contra él.
 *
 *   npm run schema
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { RunRequest, Trace } from '../src/trace/schema.ts'

const shared = join(import.meta.dirname, '..', '..', 'shared')

function emit(schema: z.ZodType, file: string, title: string, description: string) {
  const json = {
    ...z.toJSONSchema(schema, { target: 'draft-2020-12' }),
    $id: `https://java-heap-visualizer/${file}`,
    title,
    description: `${description} Generado desde frontend/src/trace/schema.ts — no editar a mano.`,
  }
  writeFileSync(join(shared, 'schema', file), JSON.stringify(json, null, 2) + '\n')
  console.log(`✔ shared/schema/${file}`)
}
emit(Trace, 'trace.schema.json', 'Trace', 'Traza paso a paso de la ejecución de un programa Java.')
emit(RunRequest, 'run-request.schema.json', 'RunRequest', 'Pedido de ejecución que el frontend manda a POST /api/run.')

let failed = false
const examplesDir = join(shared, 'examples')
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.json'))) {
  const result = Trace.safeParse(JSON.parse(readFileSync(join(examplesDir, file), 'utf8')))
  if (!result.success) {
    failed = true
    console.error(`✘ ${file}\n${z.prettifyError(result.error)}`)
    continue
  }
  // Chequeo extra que zod no expresa: toda ref apunta a un objeto existente en ese paso.
  const dangling = result.data.steps.flatMap((step, i) => {
    const ids = JSON.stringify(step).matchAll(/"kind":"ref","id":"([^"]+)"/g)
    return [...ids].map((m) => m[1]).filter((id) => !(id in step.heap)).map((id) => `paso ${i}: ref ${id}`)
  })
  if (dangling.length) {
    failed = true
    console.error(`✘ ${file}: referencias colgadas\n  ${dangling.join('\n  ')}`)
    continue
  }
  // Y todo archivo mencionado existe en `files`.
  const paths = new Set(result.data.files.map((f) => f.path))
  const missing = result.data.steps.flatMap((step, i) =>
    [step.file, ...step.stack.map((f) => f.file)]
      .filter((p) => !paths.has(p))
      .map((p) => `paso ${i}: ${p}`),
  )
  if (missing.length) {
    failed = true
    console.error(`✘ ${file}: archivos que no están en files\n  ${[...new Set(missing)].join('\n  ')}`)
    continue
  }
  console.log(`✔ ${file} (${result.data.steps.length} pasos)`)
}
process.exit(failed ? 1 : 0)
