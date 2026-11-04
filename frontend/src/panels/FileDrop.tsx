import { useEffect, useState } from 'react'
import { useTraceStore } from '../trace/store'

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

/**
 * Permite soltar un archivo en cualquier parte de la ventana.
 * Escucha en captura para que Monaco/React Flow no se queden con el evento.
 */
export default function FileDrop() {
  const loadFile = useTraceStore((s) => s.loadFile)
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
      const file = e.dataTransfer?.files[0]
      if (file) void loadFile(file)
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
  }, [loadFile])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-indigo-600/15 backdrop-blur-[1px]">
      <div className="rounded-xl border-2 border-dashed border-indigo-500 bg-white px-8 py-6 text-lg font-medium text-indigo-700 shadow-lg dark:bg-zinc-900 dark:text-indigo-300">
        Soltá la traza (.json) para abrirla
      </div>
    </div>
  )
}
