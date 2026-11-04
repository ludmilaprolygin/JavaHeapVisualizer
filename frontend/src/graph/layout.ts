/**
 * Posiciona las cajas y traza las flechas con elk (layered, de izquierda a derecha).
 *
 * - Todo el stack (frames + estáticos) se le pasa a elk como UN solo nodo-columna
 *   fijado a la primera capa, así la pila conserva su orden y forma.
 * - Cada fila con referencia es un puerto en posición fija, y cada objeto del
 *   heap tiene un puerto de entrada en su encabezado. Así elk rutea las flechas
 *   desde la fila exacta y esquivando las cajas.
 *
 * Los tamaños se calculan acá y se le imponen al DOM (ver BoxNode), así elk
 * trabaja con las medidas reales sin tener que medir el render.
 */
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode, ElkPort } from 'elkjs/lib/elk.bundled.js'
import type { Box, GraphModel } from './model'

export const HEADER_H = 28
export const ROW_H = 24
const BORDER = 1
const CHAR_W = 7.3 // ~ text-xs font-mono
const MIN_W = 120
const STACK_GAP = 16
const STACK_ID = '__stack__'

export interface Placed {
  box: Box
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Layout {
  boxes: Placed[]
  /** Recorrido de cada flecha (por Arrow.id), en coordenadas absolutas. */
  routes: Map<string, Point[]>
}

export function boxSize(box: Box): { width: number; height: number } {
  const longestRow = Math.max(0, ...box.rows.map((r) => r.label.length + r.text.length + 2))
  const header = box.title.length + (box.subtitle?.length ?? 0) + 2
  const width = Math.max(MIN_W, Math.ceil(Math.max(longestRow, header) * CHAR_W) + 36)
  const height = HEADER_H + Math.max(1, box.rows.length) * ROW_H + 2 * BORDER
  return { width, height }
}

/** Centro vertical de la fila i, relativo al borde superior de la caja. */
const rowCenter = (i: number) => BORDER + HEADER_H + i * ROW_H + ROW_H / 2

export const portId = (boxId: string, row: number | 'in') => `${boxId}#${row}`

function refPorts(box: Box, x: number, yOffset: number): ElkPort[] {
  return box.rows.flatMap((r, i) =>
    r.value.kind === 'ref'
      ? [{ id: portId(box.id, i), x, y: yOffset + rowCenter(i), width: 0, height: 0 }]
      : [],
  )
}

const elk = new ELK()

export async function layoutGraph(model: GraphModel): Promise<Layout> {
  // Columna del stack: todas las cajas con el mismo ancho, apiladas.
  const stackSizes = model.stackBoxes.map(boxSize)
  const columnW = Math.max(0, ...stackSizes.map((s) => s.width))
  let y = 0
  const stack = model.stackBoxes.map((box, i) => {
    const placed = { box, x: 0, y, width: columnW, height: stackSizes[i].height }
    y += placed.height + STACK_GAP
    return placed
  })
  const columnH = Math.max(0, y - STACK_GAP)

  const children: ElkNode[] = []
  if (stack.length) {
    children.push({
      id: STACK_ID,
      width: columnW,
      height: columnH,
      ports: stack.flatMap((s) => refPorts(s.box, columnW, s.y)),
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        'elk.layered.layering.layerConstraint': 'FIRST',
      },
    })
  }
  const heap = model.heapBoxes.map((box) => ({ box, ...boxSize(box) }))
  for (const h of heap) {
    children.push({
      id: h.box.id,
      width: h.width,
      height: h.height,
      ports: [
        { id: portId(h.box.id, 'in'), x: 0, y: BORDER + HEADER_H / 2, width: 0, height: 0 },
        ...refPorts(h.box, h.width, 0),
      ],
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    })
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '28',
      'elk.spacing.edgeNode': '16',
      'elk.spacing.edgeEdge': '10',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children,
    edges: [
      ...model.arrows.map((a) => ({
        id: a.id,
        sources: [portId(a.source, a.sourceRow)],
        targets: [portId(a.target, 'in')],
      })),
      // Objetos que nadie referencia (p.ej. recién construidos, todavía sin asignar):
      // sin una arista elk los pondría en la columna del stack. Esta arista no se dibuja.
      ...(stack.length
        ? heap
            .filter((h) => !model.arrows.some((a) => a.target === h.box.id))
            .map((h) => ({ id: `__orphan__${h.box.id}`, sources: [STACK_ID], targets: [portId(h.box.id, 'in')] }))
        : []),
    ],
  }
  const result = await elk.layout(graph)

  const pos = new Map(result.children?.map((c) => [c.id, c]))
  const stackPos = pos.get(STACK_ID)
  const boxes: Placed[] = [
    ...stack.map((s) => ({ ...s, x: stackPos?.x ?? 0, y: (stackPos?.y ?? 0) + s.y })),
    ...heap.map((h) => {
      const p = pos.get(h.box.id)
      return { ...h, x: p?.x ?? 0, y: p?.y ?? 0 }
    }),
  ]

  const routes = new Map<string, Point[]>()
  for (const e of result.edges ?? []) {
    const s = e.sections?.[0]
    if (s) routes.set(e.id, [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
  }
  return { boxes, routes }
}
