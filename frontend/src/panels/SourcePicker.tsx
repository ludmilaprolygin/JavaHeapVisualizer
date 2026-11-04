import { useRef } from 'react'
import { examples } from '../trace/sources'
import { useTraceStore } from '../trace/store'

const control =
  'rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'

/** Selector de ejemplos + botón para abrir una traza desde disco. */
export default function SourcePicker() {
  const sourceName = useTraceStore((s) => s.sourceName)
  const loadExample = useTraceStore((s) => s.loadExample)
  const loadFile = useTraceStore((s) => s.loadFile)
  const input = useRef<HTMLInputElement>(null)
  const isExample = examples.some((e) => e.name === sourceName)

  return (
    <div className="flex items-center gap-2">
      <select
        className={control}
        value={isExample ? sourceName! : ''}
        onChange={(e) => {
          const ex = examples.find((x) => x.name === e.target.value)
          if (ex) void loadExample(ex)
        }}
        aria-label="Ejemplo"
      >
        {!isExample && <option value="">{sourceName ?? 'Elegí un ejemplo…'}</option>}
        {examples.map((ex) => (
          <option key={ex.name} value={ex.name}>
            {ex.name}
          </option>
        ))}
      </select>
      <button className={control} onClick={() => input.current?.click()} title="Abrir una traza .json (o arrastrala a la ventana)">
        Abrir…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json,.java"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void loadFile(file)
          e.target.value = '' // permite volver a abrir el mismo archivo
        }}
      />
    </div>
  )
}
