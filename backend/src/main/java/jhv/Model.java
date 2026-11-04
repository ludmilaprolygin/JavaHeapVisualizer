package jhv;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.util.List;
import java.util.Map;

/**
 * Espejo en Java del contrato definido en frontend/src/trace/schema.ts
 * (ver también shared/schema/*.schema.json). Si cambia uno, cambia el otro.
 */
public final class Model {
    private Model() {}

    public static final int TRACE_VERSION = 2;

    public static final ObjectMapper JSON = new ObjectMapper()
            .setDefaultPropertyInclusion(JsonInclude.Value.construct(JsonInclude.Include.NON_NULL, JsonInclude.Include.NON_NULL))
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    // ---------------------------------------------------------------- pedido

    public record SourceFile(String path, String content) {}

    public record RunRequest(List<SourceFile> files, String mainClass) {}

    // ---------------------------------------------------------------- valores

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = Prim.class, name = "prim"),
        @JsonSubTypes.Type(value = Null.class, name = "null"),
        @JsonSubTypes.Type(value = Ref.class, name = "ref"),
    })
    public sealed interface Value permits Prim, Null, Ref {}

    /** value: Boolean, Integer, Float/Double, o String (char, long, NaN/Infinity). */
    public record Prim(String type, Object value) implements Value {}

    public record Null() implements Value {
        public static final Null INSTANCE = new Null();
    }

    public record Ref(String id) implements Value {}

    public record Var(String name, Value value) {}

    public record Entry(Value key, Value value) {}

    // ---------------------------------------------------------------- heap

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = ObjectNode.class, name = "object"),
        @JsonSubTypes.Type(value = ArrayNode.class, name = "array"),
        @JsonSubTypes.Type(value = StringNode.class, name = "string"),
        @JsonSubTypes.Type(value = BoxedNode.class, name = "boxed"),
        @JsonSubTypes.Type(value = ListNode.class, name = "list"),
        @JsonSubTypes.Type(value = SetNode.class, name = "set"),
        @JsonSubTypes.Type(value = MapNode.class, name = "map"),
        @JsonSubTypes.Type(value = OpaqueNode.class, name = "opaque"),
    })
    public sealed interface HeapNode
            permits ObjectNode, ArrayNode, StringNode, BoxedNode, ListNode, SetNode, MapNode, OpaqueNode {}

    public record ObjectNode(@JsonProperty("class") String className, List<Var> fields) implements HeapNode {}

    public record ArrayNode(String elemType, List<Value> items) implements HeapNode {}

    public record StringNode(String value) implements HeapNode {}

    public record BoxedNode(@JsonProperty("class") String className, Prim value) implements HeapNode {}

    public record ListNode(@JsonProperty("class") String className, List<Value> items) implements HeapNode {}

    public record SetNode(@JsonProperty("class") String className, List<Value> items) implements HeapNode {}

    public record MapNode(@JsonProperty("class") String className, List<Entry> entries) implements HeapNode {}

    public record OpaqueNode(@JsonProperty("class") String className, String label) implements HeapNode {}

    // ---------------------------------------------------------------- pasos

    public record Frame(
            String id,
            @JsonProperty("class") String className,
            String method,
            String file,
            int line,
            List<Var> locals) {}

    public record ExceptionInfo(
            @JsonProperty("class") String className,
            @JsonInclude(JsonInclude.Include.ALWAYS) String message,
            String id) {}

    public record Step(
            String event,
            String file,
            int line,
            List<Frame> stack,
            Map<String, HeapNode> heap,
            Map<String, List<Var>> statics,
            String stdout,
            Value returnValue,
            ExceptionInfo exception) {

        Step withStdout(String newStdout) {
            return new Step(event, file, line, stack, heap, statics, newStdout, returnValue, exception);
        }
    }

    public record ErrorInfo(String message, String file, Integer line, Integer column) {}

    public record Trace(
            int version,
            List<SourceFile> files,
            String mainClass,
            String status,
            ErrorInfo error,
            List<Step> steps) {}
}
