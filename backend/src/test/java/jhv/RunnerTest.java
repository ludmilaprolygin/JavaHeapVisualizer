package jhv;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import jhv.Model.Frame;
import jhv.Model.ListNode;
import jhv.Model.MapNode;
import jhv.Model.ObjectNode;
import jhv.Model.Prim;
import jhv.Model.RunRequest;
import jhv.Model.SourceFile;
import jhv.Model.Step;
import jhv.Model.Trace;
import jhv.Model.Var;
import org.junit.jupiter.api.Test;

class RunnerTest {

    private static Trace run(String mainClass, SourceFile... files) throws Exception {
        return Runner.run(new RunRequest(List.of(files), mainClass));
    }

    private static SourceFile file(String path, String... lines) {
        return new SourceFile(path, String.join("\n", lines) + "\n");
    }

    @Test
    void multiFileProjectTracesIntoOtherFiles() throws Exception {
        Trace t = run(null,
                file("com/banco/Main.java",
                        "package com.banco;",
                        "public class Main {",
                        "    public static void main(String[] args) {",
                        "        Cuenta c = new Cuenta();",
                        "        c.depositar(100);",
                        "        System.out.println(c.saldo);",
                        "    }",
                        "}"),
                file("com/banco/Cuenta.java",
                        "package com.banco;",
                        "public class Cuenta {",
                        "    int saldo;",
                        "    void depositar(int monto) {",
                        "        saldo += monto;",
                        "    }",
                        "}"));

        assertEquals("ok", t.status());
        assertEquals("com.banco.Main", t.mainClass(), "con un solo main se elige solo");
        assertTrue(t.steps().stream().anyMatch(s -> s.file().equals("com/banco/Cuenta.java")));
        assertEquals("100\n", t.steps().getLast().stdout());

        Step inDepositar = t.steps().stream()
                .filter(s -> s.stack().getLast().method().equals("depositar")).findFirst().orElseThrow();
        assertEquals("call", inDepositar.event());
        assertEquals(2, inDepositar.stack().size());
        assertEquals(List.of("this", "monto"), inDepositar.stack().getLast().locals().stream().map(Var::name).toList());

        // args del main no se muestra
        for (Step s : t.steps()) {
            assertFalse(s.stack().getFirst().locals().stream().anyMatch(v -> v.name().equals("args")));
        }
        // los frames conservan su id mientras viven
        assertTrue(t.steps().stream().allMatch(s -> s.stack().getFirst().id().equals("f1")));
    }

    @Test
    void constructedObjectStaysVisibleBeforeAssignment() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    int x;",
                "    public static void main(String[] args) {",
                "        Main m = new Main();",
                "        m.x = 1;",
                "    }",
                "}"));
        int ret = indexOf(t, s -> s.event().equals("return") && s.stack().getLast().method().equals("<init>"));
        Step after = t.steps().get(ret + 1);
        assertTrue(after.heap().values().stream().anyMatch(n -> n instanceof ObjectNode o && o.className().equals("Main")));
    }

    @Test
    void returnValueIsReported() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    static int doble(int x) { return x * 2; }",
                "    public static void main(String[] args) {",
                "        int y = doble(21);",
                "    }",
                "}"));
        Step ret = t.steps().stream()
                .filter(s -> s.event().equals("return") && s.stack().getLast().method().equals("doble"))
                .findFirst().orElseThrow();
        assertEquals(new Prim("int", 42), ret.returnValue());
    }

    @Test
    void collectionsAreShownAbstractly() throws Exception {
        Trace t = run("Main", file("Main.java",
                "import java.util.*;",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        List<String> l = new ArrayList<>(List.of(\"a\", \"b\"));",
                "        Map<String, Integer> m = new HashMap<>();",
                "        m.put(\"x\", 1);",
                "        System.out.println(l);",
                "    }",
                "}"));
        assertEquals("ok", t.status());
        Step last = t.steps().getLast();
        assertTrue(last.heap().values().stream().anyMatch(n -> n instanceof ListNode l && l.items().size() == 2));
        assertTrue(last.heap().values().stream().anyMatch(n -> n instanceof MapNode m && m.entries().size() == 1));
    }

    @Test
    void staticsAreShown() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    static int contador = 0;",
                "    public static void main(String[] args) {",
                "        contador = 5;",
                "    }",
                "}"));
        assertEquals(List.of(new Var("contador", new Prim("int", 5))), t.steps().getLast().statics().get("Main"));
    }

    @Test
    void uncaughtExceptionIsRuntimeError() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int[] v = new int[2];",
                "        v[2] = 5;",
                "    }",
                "}"));
        assertEquals("runtime_error", t.status());
        assertEquals(4, t.error().line());
        assertEquals("Main.java", t.error().file());
        assertTrue(t.error().message().startsWith("java.lang.ArrayIndexOutOfBoundsException"));
        Step exc = t.steps().stream().filter(s -> s.event().equals("exception")).findFirst().orElseThrow();
        assertNotNull(exc.heap().get(exc.exception().id()), "el objeto excepción está en el heap");
    }

    @Test
    void caughtExceptionIsShownButProgramContinues() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        try {",
                "            throw new IllegalStateException(\"ups\");",
                "        } catch (IllegalStateException e) {",
                "            System.out.println(\"atrapada\");",
                "        }",
                "    }",
                "}"));
        assertEquals("ok", t.status());
        assertTrue(t.steps().stream().anyMatch(s -> s.event().equals("exception")
                && "ups".equals(s.exception().message())));
        assertEquals("atrapada\n", t.steps().getLast().stdout());
    }

    @Test
    void exceptionInsideJdkIsReported() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int n = Integer.parseInt(\"hola\");",
                "    }",
                "}"));
        assertEquals("runtime_error", t.status());
        assertEquals(3, t.error().line(), "la línea es la del código del usuario, no la del JDK");
    }

    @Test
    void compileErrorPointsToFileAndLine() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int x = \"texto\";",
                "    }",
                "}"));
        assertEquals("compile_error", t.status());
        assertEquals("Main.java", t.error().file());
        assertEquals(3, t.error().line());
        assertTrue(t.steps().isEmpty());
    }

    @Test
    void severalMainsRequireChoosing() throws Exception {
        SourceFile a = file("A.java", "public class A { public static void main(String[] args) {} }");
        SourceFile b = file("B.java", "public class B { public static void main(String[] args) {} }");
        Trace t = run(null, a, b);
        assertEquals("compile_error", t.status());
        assertTrue(t.error().message().contains("A, B"));
        assertEquals("ok", run("B", a, b).status());
    }

    @Test
    void infiniteLoopHitsStepLimit() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int i = 0;",
                "        while (i >= 0) {",
                "            i++;",
                "        }",
                "    }",
                "}"));
        assertEquals("step_limit", t.status());
        assertEquals(Runner.MAX_STEPS, t.steps().size());
    }

    @Test
    void loopOnASingleLineEndsByTimeout() throws Exception {
        // JDI avanza "por línea": si el bucle entero está en una línea, nunca hay un paso nuevo.
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int i = 0;",
                "        while (true) { i++; }",
                "    }",
                "}"));
        assertEquals("timeout", t.status());
    }

    @Test
    void readingStdinDoesNotHang() throws Exception {
        Trace t = run("Main", file("Main.java",
                "import java.util.Scanner;",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        int n = new Scanner(System.in).nextInt();",
                "    }",
                "}"));
        assertEquals("runtime_error", t.status());
        assertTrue(t.error().message().contains("NoSuchElementException"));
    }

    @Test
    void recursionGetsOneFramePerCall() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    static int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }",
                "    public static void main(String[] args) {",
                "        System.out.println(fact(4));",
                "    }",
                "}"));
        int deepest = t.steps().stream().mapToInt(s -> s.stack().size()).max().orElse(0);
        assertEquals(5, deepest); // main + fact(4..1)
        Step deep = t.steps().stream().filter(s -> s.stack().size() == 5).findFirst().orElseThrow();
        assertEquals(5, deep.stack().stream().map(Frame::id).distinct().count());
        assertEquals("24\n", t.steps().getLast().stdout());
    }

    @Test
    void rejectsPathsOutsideTheProject() {
        var e = assertThrows(Runner.BadRequest.class, () -> run("Main", file("../evil.java", "class X {}")));
        assertTrue(e.getMessage().contains("Ruta inválida"));
        assertThrows(Runner.BadRequest.class, () -> run("Main", file("/etc/x.java", "class X {}")));
    }

    @Test
    void serializesAccordingToContract() throws Exception {
        Trace t = run("Main", file("Main.java",
                "public class Main {",
                "    public static void main(String[] args) {",
                "        Integer a = 5; char c = 'x'; long l = 1L << 60; double d = 0.0 / 0.0;",
                "    }",
                "}"));
        String json = Model.JSON.writeValueAsString(t);
        assertTrue(json.contains("\"kind\":\"boxed\""));
        assertTrue(json.contains("\"type\":\"char\",\"value\":\"x\""));
        assertTrue(json.contains("\"type\":\"long\",\"value\":\"1152921504606846976\""));
        assertTrue(json.contains("\"type\":\"double\",\"value\":\"NaN\""));
    }

    private static int indexOf(Trace t, java.util.function.Predicate<Step> p) {
        for (int i = 0; i < t.steps().size(); i++) if (p.test(t.steps().get(i))) return i;
        throw new AssertionError("no hay paso que cumpla");
    }
}
