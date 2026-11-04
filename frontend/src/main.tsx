import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import sample from '@shared/examples/linked-nodes.trace.json'
import App from './App.tsx'
import './index.css'
import './monaco'
import { parseTrace } from './trace/schema'
import { useTraceStore } from './trace/store'

// Mientras no haya backend, arrancamos con una traza de ejemplo.
useTraceStore.getState().load(parseTrace(sample))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
