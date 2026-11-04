/**
 * Contrato entre backend (Java + JDI) y frontend.
 *
 * Esta es la ÚNICA fuente de verdad: los tipos TS se infieren de acá y
 * `npm run schema` genera shared/schema/trace.schema.json para el backend.
 *
 * Modelo: una traza es una lista de pasos. Cada paso es una foto COMPLETA
 * del estado justo ANTES de ejecutar `line` (igual que un StepEvent de JDI).
 * Las fotos completas hacen trivial ir hacia atrás y comparar pasos; para
 * programas didácticos el tamaño no es problema.
 */
import { z } from 'zod'

export const TRACE_VERSION = 1

// ---------------------------------------------------------------------------
// Valores: lo que puede haber en una variable local, un campo o una celda.
// ---------------------------------------------------------------------------

export const PrimitiveType = z.enum([
  'boolean',
  'byte',
  'short',
  'char',
  'int',
  'long',
  'float',
  'double',
])

export const PrimValue = z.object({
  kind: z.literal('prim'),
  type: PrimitiveType,
  /**
   * boolean -> boolean, char -> string de 1 carácter,
   * long -> string (puede superar Number.MAX_SAFE_INTEGER),
   * el resto -> number. NaN/Infinity se mandan como string ("NaN", "Infinity").
   */
  value: z.union([z.number(), z.string(), z.boolean()]),
})

export const NullValue = z.object({ kind: z.literal('null') })

/** Referencia a un objeto del heap; se dibuja como flecha. */
export const RefValue = z.object({
  kind: z.literal('ref'),
  id: z.string(),
})

export const Value = z.discriminatedUnion('kind', [PrimValue, NullValue, RefValue])

// ---------------------------------------------------------------------------
// Objetos del heap.
// `class` es el nombre binario de JDI (p.ej. "Main$Nodo", "java.util.ArrayList");
// el frontend decide cómo abreviarlo.
// ---------------------------------------------------------------------------

/** Instancia de una clase de usuario: se muestran sus campos tal cual. */
export const ObjectNode = z.object({
  kind: z.literal('object'),
  class: z.string(),
  fields: z.array(z.object({ name: z.string(), value: Value })),
})

export const ArrayNode = z.object({
  kind: z.literal('array'),
  /** Tipo de elemento tal como se escribe en Java: "int", "String", "Main$Nodo[]". */
  elemType: z.string(),
  items: z.array(Value),
})

/** String se muestra como valor, sin abrir value[]/hash/coder. */
export const StringNode = z.object({
  kind: z.literal('string'),
  value: z.string(),
})

/** Integer, Double, Character, etc. */
export const BoxedNode = z.object({
  kind: z.literal('boxed'),
  class: z.string(),
  value: PrimValue,
})

/** List y Deque del JDK (ArrayList, LinkedList, ArrayDeque...), vista abstracta. */
export const ListNode = z.object({
  kind: z.literal('list'),
  class: z.string(),
  items: z.array(Value),
})

/** Set del JDK, vista abstracta, en orden de iteración. */
export const SetNode = z.object({
  kind: z.literal('set'),
  class: z.string(),
  items: z.array(Value),
})

/** Map del JDK, vista abstracta, en orden de iteración. */
export const MapNode = z.object({
  kind: z.literal('map'),
  class: z.string(),
  entries: z.array(z.object({ key: Value, value: Value })),
})

/** Objeto que el backend decidió no expandir (clases internas del JDK, lambdas, etc.). */
export const OpaqueNode = z.object({
  kind: z.literal('opaque'),
  class: z.string(),
  /** Resultado de toString() si se pudo obtener sin efectos secundarios. */
  label: z.string().optional(),
})

export const HeapNode = z.discriminatedUnion('kind', [
  ObjectNode,
  ArrayNode,
  StringNode,
  BoxedNode,
  ListNode,
  SetNode,
  MapNode,
  OpaqueNode,
])

// ---------------------------------------------------------------------------
// Stack y pasos.
// ---------------------------------------------------------------------------

export const Frame = z.object({
  /**
   * Id estable mientras el frame vive (p.ej. contador de llamadas "f3").
   * Permite animar/identificar el mismo frame entre pasos aunque cambie la profundidad.
   */
  id: z.string(),
  class: z.string(),
  /** "main", "<init>" para constructores, "<clinit>" para inicializadores estáticos. */
  method: z.string(),
  line: z.number().int(),
  /** Variables visibles en ese punto, en orden de declaración. `this` va primero si existe. */
  locals: z.array(z.object({ name: z.string(), value: Value })),
})

export const StepEvent = z.enum([
  /** Se va a ejecutar una línea nueva. */
  'line',
  /** Se acaba de entrar a un método (el frame tope es nuevo). */
  'call',
  /** El frame tope está por retornar; ver `returnValue`. */
  'return',
  /** Se lanzó una excepción; ver `exception`. */
  'exception',
])

export const Step = z.object({
  event: StepEvent,
  /** Línea del archivo fuente (1-based) que se está por ejecutar. */
  line: z.number().int().positive(),
  /** Pila de llamadas: índice 0 = main (fondo), último = frame actual (tope). */
  stack: z.array(Frame),
  /** Objetos alcanzables desde el stack y los estáticos, indexados por id. */
  heap: z.record(z.string(), HeapNode),
  /** Campos estáticos de las clases de usuario: { "Main": [{ name, value }] }. */
  statics: z.record(z.string(), z.array(z.object({ name: z.string(), value: Value }))),
  /** Salida estándar acumulada hasta este paso (stdout + stderr intercalados). */
  stdout: z.string(),
  /** Solo en event = "return". `null` si el método es void. */
  returnValue: Value.nullable().optional(),
  /** Solo en event = "exception". */
  exception: z
    .object({ class: z.string(), message: z.string().nullable(), id: z.string().optional() })
    .optional(),
})

export const TraceStatus = z.enum([
  /** El programa terminó normalmente. */
  'ok',
  /** No compiló: `steps` está vacío y `error` trae el diagnóstico. */
  'compile_error',
  /** Terminó por una excepción no atrapada. */
  'runtime_error',
  /** Se cortó al alcanzar el máximo de pasos. */
  'step_limit',
  /** Se cortó por tiempo. */
  'timeout',
])

export const Trace = z.object({
  version: z.literal(TRACE_VERSION),
  /** Código fuente tal como se ejecutó (para mostrarlo en Monaco). */
  source: z.string(),
  mainClass: z.string(),
  status: TraceStatus,
  error: z
    .object({
      message: z.string(),
      line: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
    })
    .optional(),
  steps: z.array(Step),
})

// ---------------------------------------------------------------------------
// Tipos TS
// ---------------------------------------------------------------------------

export type PrimitiveType = z.infer<typeof PrimitiveType>
export type PrimValue = z.infer<typeof PrimValue>
export type RefValue = z.infer<typeof RefValue>
export type Value = z.infer<typeof Value>
export type HeapNode = z.infer<typeof HeapNode>
export type Frame = z.infer<typeof Frame>
export type StepEvent = z.infer<typeof StepEvent>
export type Step = z.infer<typeof Step>
export type TraceStatus = z.infer<typeof TraceStatus>
export type Trace = z.infer<typeof Trace>

/** Valida una traza que llega del backend; tira ZodError con detalle si no cumple. */
export function parseTrace(data: unknown): Trace {
  return Trace.parse(data)
}
