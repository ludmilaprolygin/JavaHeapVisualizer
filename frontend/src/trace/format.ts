import type { Frame, HeapNode, PrimValue, Value } from './schema'

/** "Main$Nodo" -> "Main.Nodo", "java.util.ArrayList" -> "ArrayList". */
export function shortClass(binaryName: string): string {
  const simple = binaryName.slice(binaryName.lastIndexOf('.') + 1)
  return simple.replaceAll('$', '.')
}

/** "String" o "java.lang.String[]" -> abreviado, conservando los []. */
export function shortType(type: string): string {
  const dims = type.match(/(\[\])*$/)?.[0] ?? ''
  return shortClass(type.slice(0, type.length - dims.length)) + dims
}

export function formatPrim(v: PrimValue): string {
  switch (v.type) {
    case 'char':
      return `'${v.value}'`
    case 'long':
      return `${v.value}L`
    case 'float':
      return `${v.value}f`
    default:
      return String(v.value)
  }
}

/** Texto de un valor para mostrar en una celda. Las refs no tienen texto: se dibujan como flecha. */
export function formatValue(v: Value): string {
  switch (v.kind) {
    case 'prim':
      return formatPrim(v)
    case 'null':
      return 'null'
    case 'ref':
      return ''
  }
}

export function frameTitle(f: Frame): string {
  const cls = shortClass(f.class)
  if (f.method === '<init>') return `new ${cls}(…)`
  if (f.method === '<clinit>') return `static ${cls}`
  return `${cls}.${f.method}(…)`
}

export function heapTitle(node: HeapNode): string {
  switch (node.kind) {
    case 'string':
      return 'String'
    case 'array':
      return `${shortType(node.elemType)}[${node.items.length}]`
    case 'list':
    case 'set':
    case 'map':
    case 'object':
    case 'boxed':
    case 'opaque':
      return shortClass(node.class)
  }
}

export const sameValue = (a: Value | undefined, b: Value | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
