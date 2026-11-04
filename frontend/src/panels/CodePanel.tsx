import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor/editor/editor.api'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SourceFile, Trace } from '../trace/schema'
import { useCurrentStep, useTraceStore } from '../trace/store'
import { usePrefersDark } from '../usePrefersDark'

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** El archivo de la clase principal primero, el resto alfabético. */
function orderFiles(trace: Trace): SourceFile[] {
  const mainPath = trace.mainClass.replaceAll('.', '/') + '.java'
  return [...trace.files].sort(
    (a, b) => Number(b.path === mainPath) - Number(a.path === mainPath) || a.path.localeCompare(b.path),
  )
}

/** Nombre corto de pestaña; si dos archivos se llaman igual (distinto paquete), ruta completa. */
function tabLabels(files: SourceFile[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const f of files) count.set(basename(f.path), (count.get(basename(f.path)) ?? 0) + 1)
  return new Map(files.map((f) => [f.path, count.get(basename(f.path))! > 1 ? f.path : basename(f.path)]))
}

export default function CodePanel() {
  const trace = useTraceStore((s) => s.trace)
  const loadId = useTraceStore((s) => s.loadId)
  const index = useTraceStore((s) => s.index)
  const step = useCurrentStep()
  const dark = usePrefersDark()

  const files = useMemo(() => (trace ? orderFiles(trace) : []), [trace])
  const labels = useMemo(() => tabLabels(files), [files])

  // Por defecto se muestra el archivo que se está ejecutando. Si el usuario elige
  // otra pestaña, se respeta hasta que cambie el paso o la traza.
  const [picked, setPicked] = useState<{ path: string; index: number; loadId: number } | null>(null)
  const followed = step?.file ?? trace?.error?.file ?? files[0]?.path
  const shown = picked && picked.index === index && picked.loadId === loadId ? picked.path : followed
  const content = files.find((f) => f.path === shown)?.content ?? ''

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null)
  // Monaco se monta async: este estado hace que el resaltado corra de nuevo cuando está listo.
  const [mounted, setMounted] = useState(false)
  // Un modelo de Monaco por archivo y por carga, así dos "Main.java" de trazas distintas no se pisan.
  const modelPrefix = `/trace-${loadId}/`

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    decorations.current = ed.createDecorationsCollection()
    setMounted(true)
  }

  function highlight() {
    const ed = editorRef.current
    if (!ed || !decorations.current) return
    if (!step) {
      decorations.current.clear()
      return
    }
    const lineRange = (line: number) => ({ startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 })
    const callers = step.stack.slice(0, -1).filter((f) => f.file === shown)
    const here = step.file === shown
    decorations.current.set([
      ...callers.map((f) => ({
        range: lineRange(f.line),
        options: { isWholeLine: true, className: 'jhv-caller-line' },
      })),
      ...(here
        ? [
            {
              range: lineRange(step.line),
              options: { isWholeLine: true, className: 'jhv-current-line', glyphMarginClassName: 'jhv-current-line-glyph' },
            },
          ]
        : []),
    ])
    if (here) ed.revealLineInCenterIfOutsideViewport(step.line)
  }

  useEffect(highlight, [step, shown, content, mounted])

  // Liberar los modelos de trazas anteriores. El Editor ya pasó al modelo nuevo
  // (los efectos de los hijos corren antes que los del padre).
  useEffect(() => {
    monacoRef.current?.editor
      .getModels()
      .filter((m: editor.ITextModel) => !m.uri.path.startsWith(modelPrefix))
      .forEach((m: editor.ITextModel) => m.dispose())
  }, [modelPrefix])

  const inStack = new Set(step?.stack.map((f) => f.file))

  return (
    <div className="flex h-full flex-col">
      {files.length > 1 && (
        <div role="tablist" className="flex shrink-0 overflow-x-auto border-b border-zinc-200 text-sm dark:border-zinc-800">
          {files.map((f) => {
            const selected = f.path === shown
            return (
              <button
                key={f.path}
                role="tab"
                aria-selected={selected}
                title={f.path}
                onClick={() => setPicked({ path: f.path, index, loadId })}
                className={`flex items-center gap-1.5 border-r border-zinc-200 px-3 py-1.5 whitespace-nowrap dark:border-zinc-800 ${
                  selected
                    ? 'bg-white font-medium dark:bg-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                {f.path === step?.file ? (
                  <span className="text-[10px] text-yellow-500" title="Se está ejecutando acá">▶</span>
                ) : inStack.has(f.path) ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" title="Hay un método de este archivo en el stack" />
                ) : null}
                {labels.get(f.path)}
              </button>
            )
          })}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Editor
          path={modelPrefix + (shown ?? 'vacio.java')}
          language="java"
          value={content}
          theme={dark ? 'vs-dark' : 'vs'}
          onMount={onMount}
          options={{
            readOnly: true,
            domReadOnly: true,
            glyphMargin: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            renderLineHighlight: 'none',
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}
