import { useCurrentStep, useTraceStore } from '../trace/store'

const statusText = {
  ok: null,
  compile_error: 'Error de compilación',
  runtime_error: 'Terminó por una excepción',
  step_limit: 'Se alcanzó el máximo de pasos (1000): se muestran los primeros',
  timeout:
    'Se superó el tiempo máximo (10 s). Ojo: un bucle escrito entero en una sola línea no genera pasos nuevos',
} as const

export default function OutputPanel() {
  const trace = useTraceStore((s) => s.trace)
  const step = useCurrentStep()
  const status = trace ? statusText[trace.status] : null

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        Salida
      </div>
      {status && (
        <div className="bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {status}
          {trace?.error && `: ${trace.error.message}`}
          {trace?.error?.line &&
            (trace.error.file && trace.files.length > 1
              ? ` (${trace.error.file}:${trace.error.line})`
              : ` (línea ${trace.error.line})`)}
        </div>
      )}
      <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-sm">
        {step?.stdout || <span className="italic text-zinc-400">(sin salida)</span>}
      </pre>
    </div>
  )
}
