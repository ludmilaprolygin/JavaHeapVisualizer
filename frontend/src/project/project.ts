/**
 * Carga de un proyecto Java desde archivos/carpetas elegidos por el usuario.
 *
 * - Se queda solo con los .java, ignorando carpetas de build/herramientas y tests.
 * - Ubica cada archivo según su `package` (no según la carpeta), así da igual si
 *   el proyecto tiene src/main/java/ adelante o está todo suelto.
 * - Detecta qué clases tienen un `main` para poder elegir cuál ejecutar.
 */
import type { SourceFile } from '../trace/schema'

export interface PickedFile {
  /** Ruta relativa a lo que eligió el usuario, p.ej. "mi-proyecto/src/com/x/A.java". */
  relPath: string
  file: File
}

export interface Project {
  name: string
  files: SourceFile[]
  /** Nombres completos de las clases con main, p.ej. "com.banco.Main". */
  mainClasses: string[]
  mainClass: string | null
  /** Archivos .java que se descartaron (tests, build...). */
  ignored: string[]
}

export class ProjectLoadError extends Error {}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.idea', '.vscode', '.gradle', '.mvn', 'build', 'target', 'out', 'bin', 'dist',
])
const MAX_FILES = 300
const MAX_BYTES = 2_000_000

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function isIgnored(relPath: string): boolean {
  const dirs = relPath.split('/').slice(0, -1)
  return dirs.some((d) => IGNORED_DIRS.has(d)) || /(^|\/)src\/test\//.test(relPath)
}

/** Saca comentarios para que un `package` o `main` comentado no confunda la detección. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

export function packageOf(src: string): string {
  return stripComments(src).match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] ?? ''
}

/** `static void main(String[] x)`, `String... x` o `String x[]`, con cualquier modificador. */
export function hasMain(src: string): boolean {
  return /\bstatic\s+(?:\w+\s+)*void\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]|\.\.\.|\s\w+\s*\[\s*\])/.test(
    stripComments(src),
  )
}

/** Si hay varios main, preferimos una clase llamada Main; si no, el primero. */
function defaultMain(mainClasses: string[]): string | null {
  return mainClasses.find((c) => c === 'Main' || c.endsWith('.Main')) ?? mainClasses[0] ?? null
}

export function withMainClass(project: Project, mainClass: string): Project {
  return project.mainClasses.includes(mainClass) ? { ...project, mainClass } : project
}

export async function buildProject(picked: PickedFile[]): Promise<Project> {
  const name = picked[0]?.relPath.split('/')[0] || 'proyecto'
  const javas = picked.filter((p) => p.relPath.endsWith('.java'))
  const ignored = javas.filter((p) => isIgnored(p.relPath)).map((p) => p.relPath)
  const used = javas.filter((p) => !isIgnored(p.relPath))

  if (used.length === 0) {
    throw new ProjectLoadError(
      ignored.length
        ? `"${name}" solo tiene .java en carpetas que se ignoran (tests o build): ${ignored.slice(0, 3).join(', ')}…`
        : `No encontré archivos .java en "${name}".`,
    )
  }
  if (used.length > MAX_FILES) {
    throw new ProjectLoadError(`"${name}" tiene ${used.length} archivos .java; el máximo es ${MAX_FILES}.`)
  }
  const bytes = used.reduce((n, p) => n + p.file.size, 0)
  if (bytes > MAX_BYTES) {
    throw new ProjectLoadError(`"${name}" pesa ${(bytes / 1e6).toFixed(1)} MB de código; el máximo es ${MAX_BYTES / 1e6} MB.`)
  }

  const files: (SourceFile & { from: string })[] = await Promise.all(
    used.map(async (p) => {
      const content = await p.file.text()
      const pkg = packageOf(content)
      const path = (pkg ? pkg.replaceAll('.', '/') + '/' : '') + basename(p.relPath)
      return { path, content, from: p.relPath }
    }),
  )

  const byPath = new Map<string, typeof files>()
  for (const f of files) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f])
  const dups = [...byPath.values()].filter((g) => g.length > 1)
  if (dups.length) {
    throw new ProjectLoadError(
      `Hay clases repetidas (mismo paquete y nombre):\n${dups.map((g) => `• ${g[0].path}: ${g.map((f) => f.from).join(', ')}`).join('\n')}`,
    )
  }

  const mainClasses = files
    .filter((f) => hasMain(f.content))
    .map((f) => f.path.replace(/\.java$/, '').replaceAll('/', '.'))
    .sort()

  return {
    name,
    files: files.map(({ path, content }) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path)),
    mainClasses,
    mainClass: defaultMain(mainClasses),
    ignored,
  }
}

// ---------------------------------------------------------------------------
// Recolección de archivos desde <input> o drag & drop.
// ---------------------------------------------------------------------------

/** Desde un <input type="file"> (con o sin webkitdirectory). */
export function pickedFromInput(list: FileList): PickedFile[] {
  return [...list].map((file) => ({ relPath: file.webkitRelativePath || file.name, file }))
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((ok, fail) => entry.file(ok, fail))

async function readDir(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader()
  const all: FileSystemEntry[] = []
  // readEntries devuelve de a tandas (~100); hay que llamarlo hasta que venga vacío.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail))
    if (batch.length === 0) return all
    all.push(...batch)
  }
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    out.push({ relPath: entry.fullPath.replace(/^\//, ''), file: await fileOf(entry as FileSystemFileEntry) })
  } else if (entry.isDirectory && !IGNORED_DIRS.has(entry.name)) {
    for (const child of await readDir(entry as FileSystemDirectoryEntry)) await walk(child, out)
  }
}

/**
 * Desde un drop (archivos y/o carpetas). Las entries hay que pedirlas de forma
 * SINCRÓNICA dentro del handler: después del primer await el DataTransfer se vacía.
 */
export function entriesFromDrop(dt: DataTransfer): FileSystemEntry[] {
  return [...dt.items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null)
}

export async function pickedFromEntries(entries: FileSystemEntry[]): Promise<PickedFile[]> {
  const out: PickedFile[] = []
  for (const e of entries) await walk(e, out)
  return out
}
