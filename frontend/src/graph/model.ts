/**
 * Convierte un Step en un modelo de "cajas con filas", independiente de React Flow.
 * Cada fila que contiene una referencia se convierte en una flecha hacia el objeto.
 * Comparando con el paso anterior marca qué cajas son nuevas y qué filas cambiaron.
 */
import type { HeapNode, Step, Value } from '../trace/schema'
import { formatValue, frameTitle, heapTitle, sameValue } from '../trace/format'

export interface Row {
  label: string
  value: Value
  /** Texto a mostrar; vacío si es una referencia (se dibuja flecha). */
  text: string
  changed: boolean
}

export type BoxKind = 'frame' | 'statics' | HeapNode['kind']

export interface Box {
  id: string
  kind: BoxKind
  title: string
  subtitle?: string
  rows: Row[]
  /** Frame actual (tope del stack). */
  active: boolean
  /** No existía en el paso anterior. */
  isNew: boolean
}

export interface Arrow {
  id: string
  source: string
  sourceRow: number
  target: string
  changed: boolean
}

export interface GraphModel {
  /** Columna izquierda: frames (tope primero) y luego estáticos. */
  stackBoxes: Box[]
  heapBoxes: Box[]
  arrows: Arrow[]
}

export const frameBoxId = (frameId: string) => `frame:${frameId}`
export const staticsBoxId = (cls: string) => `static:${cls}`
export const heapBoxId = (objId: string) => `heap:${objId}`

type RawRow = { label: string; value: Value }

const named = (vars: { name: string; value: Value }[]): RawRow[] =>
  vars.map((v) => ({ label: v.name, value: v.value }))

const prim = (value: string): Value => ({ kind: 'prim', type: 'char', value })

/** Texto corto para usar como etiqueta (claves de mapas). Inlinea strings y boxed. */
function inlineLabel(v: Value, heap: Step['heap']): string {
  if (v.kind !== 'ref') return formatValue(v)
  const target = heap[v.id]
  if (target?.kind === 'string') return JSON.stringify(target.value)
  if (target?.kind === 'boxed') return formatValue(target.value)
  return target ? `‹${heapTitle(target)}›` : '?'
}

function heapRows(node: HeapNode, heap: Step['heap']): RawRow[] {
  switch (node.kind) {
    case 'object':
      return node.fields.map((f) => ({ label: f.name, value: f.value }))
    case 'array':
    case 'list':
      return node.items.map((value, i) => ({ label: `[${i}]`, value }))
    case 'set':
      return node.items.map((value) => ({ label: '•', value }))
    case 'map':
      return node.entries.map((e) => ({ label: inlineLabel(e.key, heap), value: e.value }))
    case 'string':
      return [{ label: '', value: prim(JSON.stringify(node.value)) }]
    case 'boxed':
      return [{ label: '', value: node.value }]
    case 'opaque':
      return node.label === undefined ? [] : [{ label: '', value: prim(node.label) }]
  }
}

/** Para strings/opaque el "valor" ya es texto listo para mostrar. */
const rowText = (kind: BoxKind, value: Value) =>
  (kind === 'string' || kind === 'opaque') && value.kind === 'prim'
    ? String(value.value)
    : formatValue(value)

function toRows(kind: BoxKind, raw: RawRow[], prev: RawRow[] | undefined): Row[] {
  return raw.map((r, i) => {
    // Comparamos por etiqueta (campos, variables) y, si se repite, por posición.
    const before = prev?.find((p) => p.label === r.label) ?? prev?.[i]
    return {
      ...r,
      text: rowText(kind, r.value),
      changed: prev !== undefined && (!before || !sameValue(before.value, r.value)),
    }
  })
}

export function buildGraph(step: Step, prev: Step | undefined): GraphModel {
  const stackBoxes: Box[] = []
  const heapBoxes: Box[] = []

  const top = step.stack.length - 1
  step.stack.forEach((frame, depth) => {
    const prevFrame = prev?.stack.find((f) => f.id === frame.id)
    stackBoxes.push({
      id: frameBoxId(frame.id),
      kind: 'frame',
      title: frameTitle(frame),
      subtitle: `línea ${frame.line}`,
      rows: toRows('frame', named(frame.locals), prevFrame && named(prevFrame.locals)),
      active: depth === top,
      isNew: !!prev && !prevFrame,
    })
  })
  stackBoxes.reverse() // tope arriba

  for (const [cls, fields] of Object.entries(step.statics)) {
    if (fields.length === 0) continue
    stackBoxes.push({
      id: staticsBoxId(cls),
      kind: 'statics',
      title: `static ${heapTitle({ kind: 'opaque', class: cls })}`,
      rows: toRows('statics', named(fields), prev?.statics[cls] && named(prev.statics[cls])),
      active: false,
      isNew: !!prev && !(cls in prev.statics),
    })
  }

  for (const [id, node] of Object.entries(step.heap)) {
    const prevNode = prev?.heap[id]
    heapBoxes.push({
      id: heapBoxId(id),
      kind: node.kind,
      title: heapTitle(node),
      subtitle: `@${id}`,
      rows: toRows(node.kind, heapRows(node, step.heap), prevNode && heapRows(prevNode, prev!.heap)),
      active: false,
      isNew: !!prev && !prevNode,
    })
  }

  const arrows: Arrow[] = []
  for (const box of [...stackBoxes, ...heapBoxes]) {
    box.rows.forEach((row, i) => {
      if (row.value.kind !== 'ref' || !(row.value.id in step.heap)) return
      arrows.push({
        id: `${box.id}#${i}`,
        source: box.id,
        sourceRow: i,
        target: heapBoxId(row.value.id),
        changed: row.changed,
      })
    })
  }

  return { stackBoxes, heapBoxes, arrows }
}
