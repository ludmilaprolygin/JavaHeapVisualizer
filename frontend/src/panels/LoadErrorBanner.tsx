import { useTraceStore } from '../trace/store'

export default function LoadErrorBanner() {
  const error = useTraceStore((s) => s.loadError)
  const dismiss = useTraceStore((s) => s.dismissError)
  if (!error) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <pre className="max-h-40 flex-1 overflow-auto font-sans whitespace-pre-wrap">{error}</pre>
      <button onClick={dismiss} className="shrink-0 rounded px-1.5 hover:bg-red-100 dark:hover:bg-red-900" aria-label="Cerrar">
        ✕
      </button>
    </div>
  )
}
