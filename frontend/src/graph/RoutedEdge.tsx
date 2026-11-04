import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import type { Point } from './layout'

export type RoutedEdgeType = Edge<{ points: Point[] }, 'routed'>

const RADIUS = 6
/** El punto de la fila está dentro de la caja; la flecha arranca desde ahí. */
const DOT_INSET = 12

/** Polilínea ortogonal con esquinas redondeadas. */
function roundedPath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]]
    const r = Math.min(RADIUS, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    const toward = (from: Point, to: Point) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
      return { x: from.x + ((to.x - from.x) / len) * r, y: from.y + ((to.y - from.y) / len) * r }
    }
    const p1 = toward(b, a)
    const p2 = toward(b, c)
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  const last = points[points.length - 1]
  return d + ` L ${last.x} ${last.y}`
}

function RoutedEdge({ id, data, sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps<RoutedEdgeType>) {
  const route = data?.points?.length ? data.points : [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ]
  const start = route[0]
  const points = [{ x: start.x - DOT_INSET, y: start.y }, ...route]
  return <BaseEdge id={id} path={roundedPath(points)} style={style} markerEnd={markerEnd} />
}

export default memo(RoutedEdge)
