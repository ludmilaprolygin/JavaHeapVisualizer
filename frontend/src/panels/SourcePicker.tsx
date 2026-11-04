import { useRef } from 'react'
import { pickedFromInput } from '../project/project'
import { examples } from '../trace/sources'
import { useTraceStore } from '../trace/store'

export const control =
  'rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800'

/** Selector de ejemplos + botones para abrir archivos o una carpeta desde disco. */
export default function SourcePicker() {
  const sourceName = useTraceStore((s) => s.sourceName)
  const loadExample = useTraceStore((s) => s.loadExample)
  const open = useTraceStore((s) => s.open)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const isExample = examples.some((e) => e.name === sourceName)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (list?.length) void open(pickedFromInput(list))
    e.target.value = '' // permite volver a elegir lo mismo
  }

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
      <button
        className={control}
        onClick={() => folderInput.current?.click()}
        title="Elegir la carpeta de un proyecto Java (o arrastrarla a la ventana)"
      >
        Abrir carpeta…
      </button>
      <button
        className={control}
        onClick={() => filesInput.current?.click()}
        title="Elegir uno o más .java, o una traza .json"
      >
        Abrir archivos…
      </button>
      <input
        ref={filesInput}
        type="file"
        multiple
        accept=".java,.json,application/json"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={(el) => {
          folderInput.current = el
          // webkitdirectory no está en los tipos de React, pero todos los navegadores lo soportan.
          el?.setAttribute('webkitdirectory', '')
        }}
        type="file"
        className="hidden"
        onChange={onPick}
      />
    </div>
  )
}
