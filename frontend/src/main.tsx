import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './monaco'
import { examples } from './trace/sources'
import { useTraceStore } from './trace/store'

// Mientras no haya backend, arrancamos con un ejemplo de shared/examples.
const initial = examples.find((e) => e.name === 'linked-nodes') ?? examples[0]
if (initial) void useTraceStore.getState().loadExample(initial)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
