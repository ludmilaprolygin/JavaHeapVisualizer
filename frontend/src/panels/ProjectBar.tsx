import { useTraceStore } from '../trace/store'
import { control } from './SourcePicker'

/** Clase a ejecutar + botón Ejecutar. Solo aparece con un proyecto cargado. */
export default function ProjectBar() {
  const project = useTraceStore((s) => s.project)
  const running = useTraceStore((s) => s.running)
  const setMainClass = useTraceStore((s) => s.setMainClass)
  const run = useTraceStore((s) => s.run)
  if (!project) return null

  const info =
    `${project.files.length} archivo${project.files.length === 1 ? '' : 's'} .java` +
    (project.ignored.length ? `\nIgnorados (tests/build): ${project.ignored.join(', ')}` : '')

  return (
    <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-2 py-1 dark:bg-indigo-950/50">
      <span className="text-sm text-indigo-900 dark:text-indigo-200" title={info}>
        {project.files.length} archivo{project.files.length === 1 ? '' : 's'}
      </span>
      {project.mainClasses.length > 1 ? (
        <select
          className={control}
          value={project.mainClass ?? ''}
          onChange={(e) => setMainClass(e.target.value)}
          aria-label="Clase a ejecutar"
          title="Clase con el main a ejecutar"
        >
          {project.mainClasses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-mono text-sm" title="Clase con el main a ejecutar">
          {project.mainClass ?? <span className="text-red-600 dark:text-red-400">sin main</span>}
        </span>
      )}
      <button
        className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        onClick={() => void run()}
        disabled={!project.mainClass || running}
        title={project.mainClass ? `Ejecutar ${project.mainClass} paso a paso` : 'Ningún archivo tiene un main'}
      >
        {running ? 'Ejecutando…' : 'Ejecutar ▶'}
      </button>
    </div>
  )
}
