package jhv;

import com.sun.jdi.ArrayReference;
import com.sun.jdi.ArrayType;
import com.sun.jdi.BooleanValue;
import com.sun.jdi.ByteValue;
import com.sun.jdi.CharValue;
import com.sun.jdi.ClassType;
import com.sun.jdi.DoubleValue;
import com.sun.jdi.Field;
import com.sun.jdi.FloatValue;
import com.sun.jdi.IntegerValue;
import com.sun.jdi.LongValue;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.PrimitiveValue;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.ShortValue;
import com.sun.jdi.StringReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import jhv.Model.ArrayNode;
import jhv.Model.BoxedNode;
import jhv.Model.Entry;
import jhv.Model.HeapNode;
import jhv.Model.ListNode;
import jhv.Model.MapNode;
import jhv.Model.Null;
import jhv.Model.ObjectNode;
import jhv.Model.OpaqueNode;
import jhv.Model.Prim;
import jhv.Model.Ref;
import jhv.Model.SetNode;
import jhv.Model.StringNode;
import jhv.Model.Value;
import jhv.Model.Var;

/**
 * Convierte valores de JDI al modelo de la traza y arma el heap alcanzable.
 *
 * Solo LEE campos: nunca invoca métodos en el programa (toString(), size()...),
 * porque eso ejecutaría código del usuario fuera del paso a paso y podría
 * cambiar su estado. Por eso las colecciones del JDK se decodifican mirando
 * sus campos internos.
 *
 * Uso: value(...) sobre cada raíz (variables, estáticos...) y después build().
 */
final class HeapReader {
    /** Más objetos que esto por paso se muestran como "opaque" sin expandir. */
    static final int MAX_OBJECTS = 300;
    /** Elementos mostrados por arreglo/colección. */
    static final int MAX_ITEMS = 100;

    private static final Set<String> BOXED = Set.of(
            "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte",
            "java.lang.Double", "java.lang.Float", "java.lang.Character", "java.lang.Boolean");

    private final Set<String> userClasses;
    private final Map<String, HeapNode> nodes = new LinkedHashMap<>();
    private final ArrayDeque<ObjectReference> pending = new ArrayDeque<>();
    private final Set<Long> seen = new HashSet<>();

    HeapReader(Set<String> userClasses) {
        this.userClasses = userClasses;
    }

    static String id(ObjectReference o) {
        return "o" + o.uniqueID();
    }

    // ------------------------------------------------------------------ valores

    Value value(com.sun.jdi.Value v) {
        if (v instanceof ObjectReference o) {
            if (seen.add(o.uniqueID())) pending.add(o);
            return new Ref(id(o));
        }
        if (v instanceof PrimitiveValue p) return prim(p);
        return Null.INSTANCE; // null o void
    }

    static Prim prim(PrimitiveValue p) {
        return switch (p) {
            case BooleanValue b -> new Prim("boolean", b.value());
            case CharValue c -> new Prim("char", String.valueOf(c.value()));
            case ByteValue b -> new Prim("byte", (int) b.value());
            case ShortValue s -> new Prim("short", (int) s.value());
            case IntegerValue i -> new Prim("int", i.value());
            case LongValue l -> new Prim("long", String.valueOf(l.value()));
            case FloatValue f -> new Prim("float", Float.isFinite(f.value()) ? (Object) f.value() : String.valueOf(f.value()));
            case DoubleValue d -> new Prim("double", Double.isFinite(d.value()) ? (Object) d.value() : String.valueOf(d.value()));
            default -> throw new IllegalArgumentException("Primitivo desconocido: " + p);
        };
    }

    // ------------------------------------------------------------------ heap

    /** Recorre en anchura todo lo alcanzable desde las raíces registradas. */
    Map<String, HeapNode> build() {
        while (!pending.isEmpty()) {
            ObjectReference o = pending.poll();
            HeapNode node;
            if (nodes.size() >= MAX_OBJECTS) {
                node = new OpaqueNode(o.referenceType().name(), "…");
            } else {
                try {
                    node = node(o);
                } catch (RuntimeException e) {
                    // Estructura interna inesperada (otra versión del JDK, objeto recolectado...).
                    node = new OpaqueNode(o.referenceType().name(), null);
                }
            }
            nodes.put(id(o), node);
        }
        return nodes;
    }

    private HeapNode node(ObjectReference o) {
        ReferenceType type = o.referenceType();
        String cls = type.name();

        if (o instanceof StringReference s) return new StringNode(s.value());
        if (o instanceof ArrayReference a) {
            String elemType = ((ArrayType) a.referenceType()).componentTypeName();
            int n = Math.min(a.length(), MAX_ITEMS);
            return new ArrayNode(elemType, values(n == 0 ? List.of() : a.getValues(0, n)));
        }
        if (BOXED.contains(cls)) return new BoxedNode(cls, prim((PrimitiveValue) get(o, "value")));
        if (cls.contains("$$Lambda")) return new OpaqueNode(cls.substring(0, cls.indexOf("$$Lambda")) + " λ", null);
        if (type instanceof ClassType ct && ct.isEnum()) return new OpaqueNode(cls, string(get(o, "name")));

        if (userClasses.contains(cls)) return userObject(o, (ClassType) type);

        HeapNode jdk = jdkObject(o, cls);
        if (jdk != null) return jdk;

        if (isSubclass(type, "java.lang.Throwable")) return new OpaqueNode(cls, string(get(o, "detailMessage")));
        // Clase que no es del usuario ni conocida: no la expandimos (sería ruido interno del JDK).
        return new OpaqueNode(cls, null);
    }

    /** Campos de instancia, de la superclase de usuario más alta hacia abajo. Se omiten los sintéticos (this$0...). */
    private HeapNode userObject(ObjectReference o, ClassType type) {
        List<ClassType> chain = new ArrayList<>();
        for (ClassType c = type; c != null && userClasses.contains(c.name()); c = c.superclass()) chain.addFirst(c);
        List<Var> fields = new ArrayList<>();
        for (ClassType c : chain) {
            for (Field f : c.fields()) {
                if (f.isStatic() || f.isSynthetic()) continue;
                fields.add(new Var(f.name(), value(o.getValue(f))));
            }
        }
        return new ObjectNode(type.name(), fields);
    }

    /** Colecciones y clases comunes del JDK, decodificadas desde sus campos internos (JDK 21). */
    private HeapNode jdkObject(ObjectReference o, String cls) {
        return switch (cls) {
            case "java.util.ArrayList", "java.util.Vector", "java.util.Stack" ->
                    new ListNode(cls, arrayPrefix(get(o, "elementData"), intField(o, cls.equals("java.util.ArrayList") ? "size" : "elementCount")));
            case "java.util.LinkedList" -> new ListNode(cls, linkedList(o));
            case "java.util.ArrayDeque" -> new ListNode(cls, arrayDeque(o));
            case "java.util.Arrays$ArrayList" -> new ListNode(cls, arrayPrefix(get(o, "a"), Integer.MAX_VALUE));
            case "java.util.ImmutableCollections$ListN" -> new ListNode("java.util.List", arrayPrefix(get(o, "elements"), Integer.MAX_VALUE));
            case "java.util.ImmutableCollections$List12" -> new ListNode("java.util.List", list12(o));
            case "java.util.HashMap" -> new MapNode(cls, hashMapEntries(o));
            case "java.util.LinkedHashMap" -> new MapNode(cls, linkedHashMapEntries(o));
            case "java.util.TreeMap" -> new MapNode(cls, treeMapEntries(o));
            case "java.util.HashSet" -> new SetNode(cls, keys(hashMapEntries((ObjectReference) get(o, "map"))));
            case "java.util.LinkedHashSet" -> new SetNode(cls, keys(linkedHashMapEntries((ObjectReference) get(o, "map"))));
            case "java.util.TreeSet" -> new SetNode(cls, keys(treeMapEntries((ObjectReference) get(o, "m"))));
            case "java.lang.StringBuilder", "java.lang.StringBuffer" -> new OpaqueNode(cls, '"' + stringBuilder(o) + '"');
            case "java.lang.Object" -> new OpaqueNode(cls, null);
            default -> null;
        };
    }

    // ------------------------------------------------------------------ colecciones

    private List<Value> values(List<? extends com.sun.jdi.Value> vs) {
        List<Value> out = new ArrayList<>(vs.size());
        for (com.sun.jdi.Value v : vs) out.add(value(v));
        return out;
    }

    private List<Value> arrayPrefix(com.sun.jdi.Value array, int size) {
        if (!(array instanceof ArrayReference a)) return List.of();
        int n = Math.min(Math.min(size, a.length()), MAX_ITEMS);
        return n == 0 ? List.of() : values(a.getValues(0, n));
    }

    private List<Value> linkedList(ObjectReference list) {
        List<Value> out = new ArrayList<>();
        for (var node = (ObjectReference) get(list, "first"); node != null && out.size() < MAX_ITEMS;
                node = (ObjectReference) get(node, "next")) {
            out.add(value(get(node, "item")));
        }
        return out;
    }

    private List<Value> arrayDeque(ObjectReference deque) {
        var a = (ArrayReference) get(deque, "elements");
        int head = intField(deque, "head"), tail = intField(deque, "tail"), len = a.length();
        List<Value> out = new ArrayList<>();
        for (int i = head; i != tail && out.size() < MAX_ITEMS; i = (i + 1) % len) out.add(value(a.getValue(i)));
        return out;
    }

    private List<Value> list12(ObjectReference list) {
        List<Value> out = new ArrayList<>();
        out.add(value(get(list, "e0")));
        com.sun.jdi.Value e1 = get(list, "e1");
        // e1 == ImmutableCollections.EMPTY cuando la lista tiene un solo elemento.
        ClassType ic = (ClassType) list.virtualMachine().classesByName("java.util.ImmutableCollections").getFirst();
        if (e1 != null && !e1.equals(ic.getValue(ic.fieldByName("EMPTY")))) out.add(value(e1));
        return out;
    }

    private List<Entry> hashMapEntries(ObjectReference map) {
        List<Entry> out = new ArrayList<>();
        if (!(get(map, "table") instanceof ArrayReference table)) return out; // tabla sin crear = vacío
        for (com.sun.jdi.Value bucket : table.getValues()) {
            for (var node = (ObjectReference) bucket; node != null && out.size() < MAX_ITEMS;
                    node = (ObjectReference) get(node, "next")) {
                out.add(entry(node));
            }
        }
        return out;
    }

    private List<Entry> linkedHashMapEntries(ObjectReference map) {
        List<Entry> out = new ArrayList<>();
        for (var node = (ObjectReference) get(map, "head"); node != null && out.size() < MAX_ITEMS;
                node = (ObjectReference) get(node, "after")) {
            out.add(entry(node));
        }
        return out;
    }

    private List<Entry> treeMapEntries(ObjectReference map) {
        List<Entry> out = new ArrayList<>();
        ArrayDeque<ObjectReference> stack = new ArrayDeque<>();
        var node = (ObjectReference) get(map, "root");
        while ((node != null || !stack.isEmpty()) && out.size() < MAX_ITEMS) { // recorrido inorden
            while (node != null) {
                stack.push(node);
                node = (ObjectReference) get(node, "left");
            }
            node = stack.pop();
            out.add(entry(node));
            node = (ObjectReference) get(node, "right");
        }
        return out;
    }

    private Entry entry(ObjectReference node) {
        return new Entry(value(get(node, "key")), value(get(node, "value")));
    }

    private static List<Value> keys(List<Entry> entries) {
        return entries.stream().map(Entry::key).toList();
    }

    private String stringBuilder(ObjectReference sb) {
        var bytes = (ArrayReference) get(sb, "value");
        int count = intField(sb, "count");
        boolean latin1 = ((ByteValue) get(sb, "coder")).value() == 0;
        int nBytes = Math.min(latin1 ? count : count * 2, bytes.length());
        byte[] raw = new byte[nBytes];
        List<com.sun.jdi.Value> vs = nBytes == 0 ? List.of() : bytes.getValues(0, nBytes);
        for (int i = 0; i < nBytes; i++) raw[i] = ((ByteValue) vs.get(i)).value();
        // UTF16 usa el orden de bytes nativo (little endian en x86/ARM).
        return new String(raw, latin1 ? StandardCharsets.ISO_8859_1 : StandardCharsets.UTF_16LE);
    }

    // ------------------------------------------------------------------ helpers de campos

    /** Lee un campo de instancia buscándolo en toda la jerarquía (incluye privados de superclases). */
    static com.sun.jdi.Value get(ObjectReference o, String name) {
        for (var t = o.referenceType(); t != null; t = t instanceof ClassType ct ? ct.superclass() : null) {
            for (Field f : t.fields()) {
                if (!f.isStatic() && f.name().equals(name)) return o.getValue(f);
            }
        }
        throw new IllegalStateException("Campo " + name + " no encontrado en " + o.referenceType().name());
    }

    private static int intField(ObjectReference o, String name) {
        return ((IntegerValue) get(o, name)).value();
    }

    private static String string(com.sun.jdi.Value v) {
        return v instanceof StringReference s ? s.value() : null;
    }

    private static boolean isSubclass(ReferenceType t, String name) {
        for (var c = t instanceof ClassType ct ? ct : null; c != null; c = c.superclass()) {
            if (c.name().equals(name)) return true;
        }
        return false;
    }
}
