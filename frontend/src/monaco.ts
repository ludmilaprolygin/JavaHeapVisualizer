/**
 * Usa el monaco-editor del paquete local en vez del CDN que @monaco-editor/react
 * usa por defecto, cargando solo el núcleo del editor y el lenguaje Java.
 * Solo hace falta el worker base: el resaltado de Java es Monarch (corre en el
 * hilo principal), no tiene language service propio.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/java/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

loader.config({ monaco })
