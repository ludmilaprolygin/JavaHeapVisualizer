import { useEffect } from 'react'
import { formatValue, frameTitle, heapTitle } from '../trace/format'
import type { Step } from '../trace/schema'
import { useCurrentStep, useTraceStore } from '../trace/store'

function describe(step: Step): string {
  const top = step.stack.at(-1)
  switch (step.event) {
    case 'call':
      return top ? `Entra a ${frameTitle(top)}` : 'Llamada'
    case 'return': {
      const name = top ? frameTitle(top) : 'método'
      const v = step.returnValue
      if (!v) return `Retorna de ${name}`
      if (v.kind !== 'ref') return `Retorna ${formatValue(v)} de ${name}`
      const target = step.heap[v.id]
      return `Retorna ${target ? heapTitle(target) : 'objeto'} de ${name}`
    }
    case 'exception':
      return `Excepción ${step.exception?.class ?? ''}${step.exception?.message ? `: ${step.exception.message}` : ''}`
    case 'line':
      return `Por ejecutar la línea ${step.line}`
  }
}

const btn =
  'rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800'

export default function StepControls() {
  const { trace, index, goTo, next, prev, first, last } = useTraceStore()
  const step = useCurrentStep()
  const total = trace?.steps.length ?? 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, .monaco-editor')) return
      const action = { ArrowRight: next, ArrowLeft: prev, Home: first, End: last }[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, first, last])

  if (!trace || !step) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn} onClick={first} disabled={index === 0} title="Primer paso (Inicio)">
        ⏮
      </button>
      <button className={btn} onClick={prev} disabled={index === 0} title="Paso anterior (←)">
        ◀ Anterior
      </button>
      <button className={btn} onClick={next} disabled={index === total - 1} title="Paso siguiente (→)">
        Siguiente ▶
      </button>
      <button className={btn} onClick={last} disabled={index === total - 1} title="Último paso (Fin)">
        ⏭
      </button>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={index}
        onChange={(e) => goTo(Number(e.target.value))}
        className="w-40 accent-indigo-600 sm:w-64"
        aria-label="Paso"
      />
      <span className="tabular-nums text-sm text-zinc-500">
        Paso {index + 1} / {total}
      </span>
      <span
        className={`rounded px-2 py-0.5 text-sm ${
          step.event === 'exception'
            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }`}
      >
        {describe(step)}
      </span>
    </div>
  )
}
