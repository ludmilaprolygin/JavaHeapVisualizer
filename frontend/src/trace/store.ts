import { create } from 'zustand'
import type { Step, Trace } from './schema'

interface TraceState {
  trace: Trace | null
  index: number
  load: (trace: Trace) => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
}

const clamp = (i: number, trace: Trace | null) =>
  trace ? Math.max(0, Math.min(i, trace.steps.length - 1)) : 0

export const useTraceStore = create<TraceState>((set, get) => ({
  trace: null,
  index: 0,
  load: (trace) => set({ trace, index: 0 }),
  goTo: (index) => set({ index: clamp(index, get().trace) }),
  next: () => get().goTo(get().index + 1),
  prev: () => get().goTo(get().index - 1),
  first: () => get().goTo(0),
  last: () => get().goTo(Number.MAX_SAFE_INTEGER),
}))

export const useCurrentStep = (): Step | undefined =>
  useTraceStore((s) => s.trace?.steps[s.index])

export const usePreviousStep = (): Step | undefined =>
  useTraceStore((s) => (s.index > 0 ? s.trace?.steps[s.index - 1] : undefined))
