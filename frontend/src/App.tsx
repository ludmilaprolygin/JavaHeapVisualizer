import HeapGraph from './graph/HeapGraph'
import CodePanel from './panels/CodePanel'
import OutputPanel from './panels/OutputPanel'
import StepControls from './panels/StepControls'

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Java Heap Visualizer</h1>
        <StepControls />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_1fr] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-1">
        <section className="flex min-h-0 flex-col border-b border-zinc-200 lg:border-r lg:border-b-0 dark:border-zinc-800">
          <div className="min-h-0 flex-1">
            <CodePanel />
          </div>
          <div className="h-40 border-t border-zinc-200 dark:border-zinc-800">
            <OutputPanel />
          </div>
        </section>
        <section className="relative min-h-0">
          <div className="absolute top-2 left-3 z-10 flex gap-3 text-xs text-zinc-500">
            <span>Stack</span>
            <span>→</span>
            <span>Heap</span>
          </div>
          <HeapGraph />
        </section>
      </main>
    </div>
  )
}
