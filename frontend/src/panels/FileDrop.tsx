import { useEffect, useState } from 'react'
import { entriesFromDrop, pickedFromEntries } from '../project/project'
import { useTraceStore } from '../trace/store'

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

/**
 * Permite soltar archivos o carpetas en cualquier parte de la ventana.
 * Una traza .json se abre directo; .java sueltos o carpetas se cargan como proyecto.
 * Escucha en captura para que Monaco/React Flow no se queden con el evento.
 */
export default function FileDrop() {
  const open = useTraceStore((s) => s.open)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0 // dragenter/dragleave se disparan por cada hijo
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      setDragging(false)
      if (!e.dataTransfer) return
      // Hay que leer las entries antes de cualquier await.
      const entries = entriesFromDrop(e.dataTransfer)
      void pickedFromEntries(entries).then((picked) => {
        if (picked.length) void open(picked)
      })
    }
    const opts = { capture: true }
    window.addEventListener('dragenter', onEnter, opts)
    window.addEventListener('dragleave', onLeave, opts)
    window.addEventListener('dragover', onOver, opts)
    window.addEventListener('drop', onDrop, opts)
    return () => {
      window.removeEventListener('dragenter', onEnter, opts)
      window.removeEventListener('dragleave', onLeave, opts)
      window.removeEventListener('dragover', onOver, opts)
      window.removeEventListener('drop', onDrop, opts)
    }
  }, [open])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-indigo-600/15 backdrop-blur-[1px]">
      <div className="rounded-xl border-2 border-dashed border-indigo-500 bg-white px-8 py-6 text-lg font-medium text-indigo-700 shadow-lg dark:bg-zinc-900 dark:text-indigo-300">
        Soltá una carpeta, archivos .java o una traza .json
      </div>
    </div>
  )
}
