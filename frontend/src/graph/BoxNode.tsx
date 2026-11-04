import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { HEADER_H, ROW_H } from './layout'
import type { Box, BoxKind } from './model'

export type BoxNodeType = Node<{ box: Box; width: number; height: number }, 'box'>

const headerColor: Record<BoxKind, string> = {
  frame: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  statics: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  object: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  array: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  string: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  boxed: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  list: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  set: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  map: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  opaque: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
}

const hidden = { opacity: 0, pointerEvents: 'none' } as const

function BoxNode({ data }: NodeProps<BoxNodeType>) {
  const { box, width, height } = data
  const header = box.active
    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
    : headerColor[box.kind]
  const ring = box.isNew
    ? 'ring-2 ring-emerald-400'
    : box.active
      ? 'ring-2 ring-indigo-400/60'
      : ''

  return (
    <div
      style={{ width, height }}
      className={`overflow-hidden rounded-md border border-zinc-300 bg-white font-mono text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${ring}`}
    >
      <div
        style={{ height: HEADER_H }}
        className={`relative flex items-center justify-between gap-2 px-2 ${header}`}
      >
        <Handle type="target" position={Position.Left} id="in" style={hidden} />
        <span className="truncate font-semibold">{box.title}</span>
        {box.subtitle && <span className="shrink-0 opacity-60">{box.subtitle}</span>}
      </div>

      {box.rows.length === 0 && (
        <div style={{ height: ROW_H }} className="flex items-center px-2 italic text-zinc-400">
          {box.kind === 'frame' ? 'sin variables' : 'vacío'}
        </div>
      )}

      {box.rows.map((row, i) => (
        <div
          key={i}
          style={{ height: ROW_H }}
          className={`relative flex items-center gap-2 border-t border-zinc-100 px-2 transition-colors duration-300 dark:border-zinc-800 ${
            row.changed ? 'bg-amber-100 dark:bg-amber-900/40' : ''
          }`}
        >
          {row.label && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{row.label}</span>}
          <span className={`ml-auto truncate ${row.value.kind === 'null' ? 'text-zinc-400 italic' : ''}`}>
            {row.text}
          </span>
          {row.value.kind === 'ref' && (
            <Handle
              type="source"
              position={Position.Right}
              id={`row-${i}`}
              isConnectable={false}
              className="!right-2 !h-2.5 !w-2.5 !border-0 !bg-zinc-500 dark:!bg-zinc-400"
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default memo(BoxNode)
