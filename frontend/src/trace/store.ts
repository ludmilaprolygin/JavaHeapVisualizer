import { create } from 'zustand'
import type { Step, Trace } from './schema'
import { readTraceFile, TraceLoadError, validateTrace, type Example } from './sources'

interface TraceState {
  trace: Trace | null
  /** Nombre del ejemplo o archivo cargado. */
  sourceName: string | null
  /** Se incrementa en cada carga; identifica la traza actual (p.ej. para modelos de Monaco). */
  loadId: number
  index: number
  loadError: string | null
  load: (trace: Trace, sourceName: string) => void
  loadExample: (example: Example) => Promise<void>
  loadFile: (file: File) => Promise<void>
  dismissError: () => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
}

const clamp = (i: number, trace: Trace | null) =>
  trace ? Math.max(0, Math.min(i, trace.steps.length - 1)) : 0

export const useTraceStore = create<TraceState>((set, get) => {
  /** Si falla la carga, la traza actual queda como estaba y se muestra el error. */
  const attempt = async (sourceName: string, getTrace: () => Promise<Trace>) => {
    try {
      get().load(await getTrace(), sourceName)
    } catch (e) {
      set({ loadError: e instanceof TraceLoadError ? e.message : `Error cargando "${sourceName}": ${String(e)}` })
    }
  }

  return {
    trace: null,
    sourceName: null,
    loadId: 0,
    index: 0,
    loadError: null,
    load: (trace, sourceName) =>
      set((s) => ({ trace, sourceName, index: 0, loadError: null, loadId: s.loadId + 1 })),
    loadExample: (example) =>
      attempt(example.name, async () => validateTrace(await example.load(), example.name)),
    loadFile: (file) => attempt(file.name, () => readTraceFile(file)),
    dismissError: () => set({ loadError: null }),
    goTo: (index) => set({ index: clamp(index, get().trace) }),
    next: () => get().goTo(get().index + 1),
    prev: () => get().goTo(get().index - 1),
    first: () => get().goTo(0),
    last: () => get().goTo(Number.MAX_SAFE_INTEGER),
  }
})

export const useCurrentStep = (): Step | undefined =>
  useTraceStore((s) => s.trace?.steps[s.index])

export const usePreviousStep = (): Step | undefined =>
  useTraceStore((s) => (s.index > 0 ? s.trace?.steps[s.index - 1] : undefined))
