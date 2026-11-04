/**
 * De dónde puede salir una traza: los ejemplos de shared/examples o un archivo
 * del usuario. Todo pasa por la validación de zod antes de llegar al store.
 */
import { z } from 'zod'
import { Trace } from './schema'

/** Todos los shared/examples/*.trace.json, cargados a demanda. Agregar un archivo ahí alcanza. */
const exampleModules = import.meta.glob<unknown>('@shared/examples/*.trace.json', { import: 'default' })

export interface Example {
  name: string
  load: () => Promise<unknown>
}

export const examples: Example[] = Object.entries(exampleModules)
  .map(([path, load]) => ({ name: path.split('/').pop()!.replace(/\.trace\.json$/, ''), load }))
  .sort((a, b) => a.name.localeCompare(b.name))

export class TraceLoadError extends Error {}

export function validateTrace(data: unknown, origin: string): Trace {
  const result = Trace.safeParse(data)
  if (!result.success) {
    throw new TraceLoadError(`"${origin}" no es una traza válida:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

export async function readTraceFile(file: File): Promise<Trace> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch (e) {
    throw new TraceLoadError(`"${file.name}" no es JSON válido: ${(e as Error).message}`)
  }
  return validateTrace(data, file.name)
}
