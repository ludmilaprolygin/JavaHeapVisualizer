import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCurrentStep, usePreviousStep, useTraceStore } from '../trace/store'
import BoxNode, { type BoxNodeType } from './BoxNode'
import { layoutGraph } from './layout'
import { buildGraph } from './model'
import RoutedEdge, { type RoutedEdgeType } from './RoutedEdge'

const nodeTypes = { box: BoxNode }
const edgeTypes = { routed: RoutedEdge }
const FIT = { padding: 0.15, maxZoom: 1.2, duration: 300 }

function Graph() {
  const step = useCurrentStep()
  const prev = usePreviousStep()
  const trace = useTraceStore((s) => s.trace)
  const { fitView, getViewport } = useReactFlow()
  const viewW = useStore((s) => s.width)
  const viewH = useStore((s) => s.height)

  const model = useMemo(() => (step ? buildGraph(step, prev) : null), [step, prev])
  // Nodos y aristas se actualizan juntos, cuando termina el layout (que es async).
  const [graph, setGraph] = useState<{ nodes: BoxNodeType[]; edges: RoutedEdgeType[] }>({ nodes: [], edges: [] })
  const fittedFor = useRef<unknown>(null)

  useEffect(() => {
    if (!model) return
    let cancelled = false
    layoutGraph(model).then(({ boxes, routes }) => {
      if (cancelled) return
      const nodes: BoxNodeType[] = boxes.map((p) => ({
        id: p.box.id,
        type: 'box',
        position: { x: p.x, y: p.y },
        data: { box: p.box, width: p.width, height: p.height },
        width: p.width,
        height: p.height,
      }))
      const edges: RoutedEdgeType[] = model.arrows.map((a) => {
        const color = a.changed ? '#f59e0b' : '#71717a'
        return {
          id: a.id,
          type: 'routed',
          source: a.source,
          sourceHandle: `row-${a.sourceRow}`,
          target: a.target,
          targetHandle: 'in',
          data: { points: routes.get(a.id) ?? [] },
          animated: a.changed,
          style: { stroke: color, strokeWidth: a.changed ? 2.5 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        }
      })
      setGraph({ nodes, edges })
    })
    return () => {
      cancelled = true
    }
  }, [model])

  // Encuadrar al cargar una traza nueva, o cuando el grafo se sale de la vista.
  useEffect(() => {
    if (!graph.nodes.length || !viewW) return
    if (fittedFor.current !== trace) {
      fittedFor.current = trace
      requestAnimationFrame(() => fitView({ ...FIT, duration: 0 }))
      return
    }
    const b = getNodesBounds(graph.nodes)
    const { x, y, zoom } = getViewport()
    const outside =
      b.x * zoom + x < 0 ||
      b.y * zoom + y < 0 ||
      (b.x + b.width) * zoom + x > viewW ||
      (b.y + b.height) * zoom + y > viewH
    if (outside) fitView(FIT)
  }, [graph, trace, fitView, getViewport, viewW, viewH])

  return (
    <ReactFlow
      className="heap-graph"
      // Sin traza (p.ej. proyecto todavía sin ejecutar) no queda dibujado el grafo anterior.
      nodes={model ? graph.nodes : []}
      edges={model ? graph.edges : []}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode="system"
      minZoom={0.2}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export default function HeapGraph() {
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  )
}
