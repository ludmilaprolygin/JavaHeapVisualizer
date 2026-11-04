import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor/editor/editor.api'
import { useEffect, useRef } from 'react'
import { usePrefersDark } from '../usePrefersDark'
import { useCurrentStep, useTraceStore } from '../trace/store'

export default function CodePanel() {
  const source = useTraceStore((s) => s.trace?.source ?? '')
  const step = useCurrentStep()
  const dark = usePrefersDark()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null)

  const onMount: OnMount = (ed) => {
    editorRef.current = ed
    decorations.current = ed.createDecorationsCollection()
    highlight()
  }

  function highlight() {
    const ed = editorRef.current
    if (!ed || !decorations.current || !step) return
    const callers = step.stack.slice(0, -1).map((f) => f.line)
    decorations.current.set([
      ...callers.map((line) => ({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: 'jhv-caller-line' },
      })),
      {
        range: { startLineNumber: step.line, startColumn: 1, endLineNumber: step.line, endColumn: 1 },
        options: { isWholeLine: true, className: 'jhv-current-line', glyphMarginClassName: 'jhv-current-line-glyph' },
      },
    ])
    ed.revealLineInCenterIfOutsideViewport(step.line)
  }

  useEffect(highlight, [step, source])

  return (
    <Editor
      language="java"
      value={source}
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
  )
}
