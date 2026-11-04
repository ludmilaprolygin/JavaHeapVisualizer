import { create } from 'zustand'
import {
  buildProject,
  projectFromFiles,
  ProjectLoadError,
  withFileContent,
  withMainClass,
  type PickedFile,
  type Project,
} from '../project/project'
import type { RunRequest, Step, Trace } from './schema'
import { readTraceFile, TraceLoadError, validateTrace, type Example } from './sources'

interface TraceState {
  trace: Trace | null
  /**
   * Código editable actual (lo que se ve en el editor y lo que se ejecuta).
   * Puede no tener traza todavía, o diferir de la traza si se editó después de ejecutar.
   */
  project: Project | null
  /** Nombre del ejemplo, archivo o carpeta cargado. */
  sourceName: string | null
  /** Se incrementa en cada carga; identifica la traza actual (p.ej. para modelos de Monaco). */
  loadId: number
  index: number
  loadError: string | null
  running: boolean
  /**
   * Carga una traza. Si viene de ejecutar el proyecto actual, `keepProject` conserva el
   * proyecto (y los modelos del editor, con su historial de deshacer). Si no, el código
   * de la traza pasa a ser el proyecto editable.
   */
  load: (trace: Trace, sourceName: string, keepProject?: boolean) => void
  loadExample: (example: Example) => Promise<void>
  /** Punto de entrada para lo que elige o arrastra el usuario: una traza .json o código Java. */
  open: (picked: PickedFile[]) => Promise<void>
  setMainClass: (mainClass: string) => void
  /** Edición en línea de un archivo del proyecto. */
  editFile: (path: string, content: string) => void
  run: () => Promise<void>
  dismissError: () => void
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
}

const clamp = (i: number, trace: Trace | null) =>
  trace ? Math.max(0, Math.min(i, trace.steps.length - 1)) : 0

const BACKEND_DOWN =
  'No pude conectar con el backend en http://localhost:7070. ¿Está corriendo? ' +
  'Levantalo con: cd backend && ./gradlew run'

export const useTraceStore = create<TraceState>((set, get) => {
  /** Si falla, lo que estaba cargado queda como estaba y se muestra el error. */
  const attempt = async (sourceName: string, action: () => Promise<void>) => {
    try {
      await action()
    } catch (e) {
      const known = e instanceof TraceLoadError || e instanceof ProjectLoadError
      set({ loadError: known ? e.message : `Error cargando "${sourceName}": ${String(e)}` })
    }
  }

  return {
    trace: null,
    project: null,
    sourceName: null,
    loadId: 0,
    index: 0,
    loadError: null,
    running: false,

    load: (trace, sourceName, keepProject = false) =>
      set((s) => ({
        trace,
        sourceName,
        project: keepProject && s.project ? s.project : projectFromFiles(sourceName, trace.files, trace.mainClass || null),
        index: 0,
        loadError: null,
        loadId: keepProject ? s.loadId : s.loadId + 1,
      })),

    loadExample: (example) =>
      attempt(example.name, async () => get().load(validateTrace(await example.load(), example.name), example.name)),

    open: (picked) => {
      const name = picked[0]?.relPath.split('/')[0] ?? 'archivo'
      return attempt(name, async () => {
        if (picked.length === 1 && picked[0].relPath.endsWith('.json')) {
          get().load(await readTraceFile(picked[0].file), picked[0].file.name)
          return
        }
        const project = await buildProject(picked)
        set((s) => ({
          project,
          trace: null,
          sourceName: project.name,
          index: 0,
          loadError: null,
          loadId: s.loadId + 1,
        }))
      })
    },

    setMainClass: (mainClass) =>
      set((s) => (s.project ? { project: withMainClass(s.project, mainClass) } : {})),

    editFile: (path, content) =>
      set((s) => (s.project ? { project: withFileContent(s.project, path, content) } : {})),

    run: async () => {
      const { project } = get()
      if (!project?.mainClass || get().running) return
      set({ running: true, loadError: null })
      await attempt(project.name, async () => {
        const body: RunRequest = { files: project.files, mainClass: project.mainClass! }
        let res: Response
        try {
          res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        } catch {
          throw new TraceLoadError(BACKEND_DOWN)
        }
        // 502/503/504 los genera el proxy de Vite cuando el backend no está levantado.
        if (res.status === 404 || res.status >= 502) throw new TraceLoadError(`${BACKEND_DOWN} (HTTP ${res.status})`)
        if (!res.ok) throw new TraceLoadError(`El backend no pudo ejecutar el proyecto (HTTP ${res.status}): ${await res.text()}`)
        get().load(validateTrace(await res.json(), project.name), project.name, true)
      })
      set({ running: false })
    },

    dismissError: () => set({ loadError: null }),
    goTo: (index) => set({ index: clamp(index, get().trace) }),
    next: () => get().goTo(get().index + 1),
    prev: () => get().goTo(get().index - 1),
    first: () => get().goTo(0),
    last: () => get().goTo(Number.MAX_SAFE_INTEGER),
  }
})

/** Archivos cuyo contenido cambió desde la traza mostrada (vacío si no hay traza). */
export const useModifiedFiles = (): Set<string> => {
  const trace = useTraceStore((s) => s.trace)
  const project = useTraceStore((s) => s.project)
  const modified = new Set<string>()
  if (!trace || !project) return modified
  const before = new Map(trace.files.map((f) => [f.path, f.content]))
  for (const f of project.files) if (before.get(f.path) !== f.content) modified.add(f.path)
  return modified
}

export const useCurrentStep = (): Step | undefined =>
  useTraceStore((s) => s.trace?.steps[s.index])

export const usePreviousStep = (): Step | undefined =>
  useTraceStore((s) => (s.index > 0 ? s.trace?.steps[s.index - 1] : undefined))
