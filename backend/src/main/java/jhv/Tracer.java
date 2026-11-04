package jhv;

import com.sun.jdi.AbsentInformationException;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.ClassType;
import com.sun.jdi.Field;
import com.sun.jdi.IncompatibleThreadStateException;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.Location;
import com.sun.jdi.Method;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StackFrame;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.VMDisconnectedException;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.VoidValue;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.connect.VMStartException;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.MethodEntryEvent;
import com.sun.jdi.event.MethodExitEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.EventRequestManager;
import com.sun.jdi.request.ExceptionRequest;
import com.sun.jdi.request.MethodEntryRequest;
import com.sun.jdi.request.MethodExitRequest;
import com.sun.jdi.request.StepRequest;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import jhv.Model.ErrorInfo;
import jhv.Model.ExceptionInfo;
import jhv.Model.Frame;
import jhv.Model.Step;
import jhv.Model.Value;
import jhv.Model.Var;

/**
 * Ejecuta el programa compilado en una JVM aparte, controlada con JDI, y
 * registra una foto del estado (stack, heap, estáticos, salida) en cada paso.
 *
 * Eventos que se convierten en pasos:
 * - StepEvent (línea por línea, entrando a métodos del usuario, salteando el JDK) -> "line" o "call"
 * - MethodExitEvent de métodos del usuario -> "return" (con el valor devuelto)
 * - ExceptionEvent -> "exception"
 *
 * Solo se sigue el hilo main. Una instancia por ejecución.
 */
final class Tracer {
    /** El JDK y librerías: no se entra paso a paso ni se muestran sus frames. */
    private static final String[] EXCLUDED = {
        "java.*", "javax.*", "jdk.*", "sun.*", "com.sun.*", "org.xml.*", "org.w3c.*", "org.ietf.*",
    };
    /** Tope de la salida guardada (se repite en cada paso, así que tiene que ser chica). */
    private static final int MAX_OUTPUT_BYTES = 20_000;

    record Result(List<Step> steps, String status, ErrorInfo error) {}

    private final Path classesDir;
    private final String mainClass;
    private final Set<String> userClasses;
    private final int maxSteps;
    private final Duration timeout;

    private VirtualMachine vm;
    private Process process;
    private ThreadReference mainThread;

    private final List<Step> steps = new ArrayList<>();
    /** Ids de los frames del usuario vivos, del fondo (main) al tope. */
    private final List<String> frameIds = new ArrayList<>();
    private int frameCounter = 0;
    /** Método al que se acaba de entrar: el próximo StepEvent en él es un "call". */
    private Method enteredMethod;
    /** Hay una excepción propagándose: las salidas de método no son "return". */
    private boolean unwinding;
    private String lastExceptionKey;
    /**
     * Objeto recién construido o devuelto por un método. Hasta que se asigna a
     * algo solo vive en la pila de operandos (que JDI no muestra), así que lo
     * agregamos como raíz en el paso siguiente para que no "desaparezca".
     */
    private ObjectReference carried;
    private final List<ReferenceType> userTypes = new ArrayList<>();

    private final ByteArrayOutputStream output = new ByteArrayOutputStream();
    private boolean outputTruncated;

    private String status = "ok";
    private ErrorInfo error;

    Tracer(Path classesDir, String mainClass, Set<String> userClasses, int maxSteps, Duration timeout) {
        this.classesDir = classesDir;
        this.mainClass = mainClass;
        this.userClasses = userClasses;
        this.maxSteps = maxSteps;
        this.timeout = timeout;
    }

    Result run() throws IOException {
        launch();
        try {
            eventLoop();
        } finally {
            shutdown();
        }
        return new Result(steps, status, error);
    }

    // ------------------------------------------------------------------ JVM

    private void launch() throws IOException {
        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> args = connector.defaultArguments();
        args.get("main").setValue(mainClass);
        args.get("options").setValue(String.join(" ",
                "-cp", "\"" + classesDir + "\"",
                "-Xmx256m",
                "-XX:+UseSerialGC",
                "-XX:TieredStopAtLevel=1",
                "-Dfile.encoding=UTF-8",
                "-Dstdout.encoding=UTF-8",
                "-Dstderr.encoding=UTF-8"));
        try {
            vm = connector.launch(args);
        } catch (IllegalConnectorArgumentsException | VMStartException e) {
            throw new IOException("No se pudo lanzar la JVM del programa: " + e.getMessage(), e);
        }
        process = vm.process();
        // Sin entrada estándar: un Scanner(System.in) recibe fin de archivo en vez de colgarse.
        process.getOutputStream().close();

        EventRequestManager erm = vm.eventRequestManager();
        ClassPrepareRequest prepare = erm.createClassPrepareRequest();
        exclude(prepare);
        prepare.enable();
    }

    private void shutdown() {
        try {
            vm.exit(0);
        } catch (VMDisconnectedException ignored) {
            // ya terminó
        }
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly();
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
        }
        // Lo que se imprimió al final (incluida la traza de una excepción no atrapada) va al último paso.
        drainOutput();
        if (!steps.isEmpty()) steps.set(steps.size() - 1, steps.getLast().withStdout(outputText()));
    }

    // ------------------------------------------------------------------ eventos

    private void eventLoop() {
        long deadline = System.nanoTime() + timeout.toNanos();
        try {
            while (true) {
                long left = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
                EventSet set = left > 0 ? vm.eventQueue().remove(left) : null;
                if (set == null) {
                    status = "timeout";
                    return;
                }
                for (Event event : set) {
                    if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) return;
                    handle(event);
                    if (steps.size() >= maxSteps) {
                        status = "step_limit";
                        return;
                    }
                }
                set.resume();
            }
        } catch (VMDisconnectedException e) {
            // el programa terminó
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void handle(Event event) {
        switch (event) {
            case ClassPrepareEvent e -> onClassPrepare(e);
            case BreakpointEvent e -> onMainStart(e);
            case MethodEntryEvent e -> {
                if (isUser(e.method().declaringType())) {
                    frameIds.add(newFrameId());
                    enteredMethod = e.method();
                }
            }
            case MethodExitEvent e -> {
                if (!isUser(e.method().declaringType())) return;
                if (!unwinding) {
                    com.sun.jdi.Value ret = e.returnValue();
                    snapshot("return", e.thread(), ret instanceof VoidValue ? null : ret, null, null);
                    carried = e.method().isConstructor() ? thisOfTopFrame(e.thread())
                            : ret instanceof ObjectReference o ? o : null;
                }
                if (!frameIds.isEmpty()) frameIds.removeLast();
            }
            case StepEvent e -> {
                unwinding = false;
                boolean isCall = enteredMethod != null && enteredMethod.equals(e.location().method());
                enteredMethod = null;
                snapshot(isCall ? "call" : "line", e.thread(), null, null, null);
            }
            case ExceptionEvent e -> onException(e);
            default -> {}
        }
    }

    private void onClassPrepare(ClassPrepareEvent e) {
        ReferenceType type = e.referenceType();
        if (!userClasses.contains(type.name())) return;
        userTypes.add(type);
        if (type.name().equals(mainClass)) {
            Method main = type.methodsByName("main", "([Ljava/lang/String;)V").getFirst();
            vm.eventRequestManager().createBreakpointRequest(main.location()).enable();
        }
    }

    /** Primera línea de main: a partir de acá se sigue paso a paso. */
    private void onMainStart(BreakpointEvent e) {
        e.request().disable();
        mainThread = e.thread();
        EventRequestManager erm = vm.eventRequestManager();

        StepRequest step = erm.createStepRequest(mainThread, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
        exclude(step);
        step.enable();

        MethodEntryRequest entry = erm.createMethodEntryRequest();
        entry.addThreadFilter(mainThread);
        exclude(entry);
        entry.enable();

        MethodExitRequest exit = erm.createMethodExitRequest();
        exit.addThreadFilter(mainThread);
        exclude(exit);
        exit.enable();

        // Excepciones lanzadas en código del usuario (atrapadas o no)...
        ExceptionRequest inUserCode = erm.createExceptionRequest(null, true, true);
        inUserCode.addThreadFilter(mainThread);
        exclude(inUserCode);
        inUserCode.enable();
        // ...y las lanzadas dentro del JDK que nadie atrapa (p.ej. Integer.parseInt("x")).
        ExceptionRequest uncaught = erm.createExceptionRequest(null, false, true);
        uncaught.addThreadFilter(mainThread);
        uncaught.enable();

        frameIds.add(newFrameId());
        snapshot("call", mainThread, null, null, null);
    }

    private void onException(ExceptionEvent e) {
        ObjectReference exc = e.exception();
        String key = exc.uniqueID() + "@" + e.location();
        if (key.equals(lastExceptionKey)) return; // las dos ExceptionRequest pueden reportar lo mismo
        lastExceptionKey = key;

        var info = new ExceptionInfo(exc.referenceType().name(), detailMessage(exc), HeapReader.id(exc));
        Step step = snapshot("exception", e.thread(), null, info, exc);
        unwinding = true;
        if (e.catchLocation() == null && error == null) {
            status = "runtime_error";
            String msg = info.className() + (info.message() != null ? ": " + info.message() : "");
            error = step != null ? new ErrorInfo(msg, step.file(), step.line(), null) : new ErrorInfo(msg, null, null, null);
        }
    }

    // ------------------------------------------------------------------ fotos

    /**
     * Arma un paso con el estado actual del hilo (que está suspendido).
     * Devuelve null si no hay frames del usuario (p.ej. todavía dentro del JDK).
     */
    private Step snapshot(String event, ThreadReference thread, com.sun.jdi.Value returnValue,
            ExceptionInfo exception, ObjectReference exceptionObject) {
        drainOutput();
        List<StackFrame> userFrames;
        try {
            userFrames = new ArrayList<>(thread.frames().stream()
                    .filter(f -> isUser(f.location().declaringType()))
                    .toList());
        } catch (IncompatibleThreadStateException e) {
            return null;
        }
        if (userFrames.isEmpty()) return null;
        userFrames = userFrames.reversed(); // fondo primero
        syncFrameIds(userFrames.size());

        HeapReader heap = new HeapReader(userClasses);
        List<Frame> frames = new ArrayList<>();
        for (int i = 0; i < userFrames.size(); i++) frames.add(frame(userFrames.get(i), frameIds.get(i), heap));

        Map<String, List<Var>> statics = statics(heap);
        Value ret = returnValue == null ? null : heap.value(returnValue);
        if (exceptionObject != null) heap.value(exceptionObject);
        if (carried != null) {
            heap.value(carried);
            carried = null;
        }

        Frame top = frames.getLast();
        Step step = new Step(event, top.file(), top.line(), frames, heap.build(), statics, outputText(), ret, exception);
        steps.add(step);
        return step;
    }

    private Frame frame(StackFrame f, String id, HeapReader heap) {
        Location loc = f.location();
        List<Var> locals = new ArrayList<>();
        ObjectReference self = f.thisObject();
        if (self != null) locals.add(new Var("this", heap.value(self)));
        try {
            List<LocalVariable> vars = f.visibleVariables().stream().filter(v -> !isMainArgs(loc, v)).toList();
            Map<LocalVariable, com.sun.jdi.Value> values = f.getValues(vars);
            for (LocalVariable v : vars) locals.add(new Var(v.name(), heap.value(values.get(v))));
        } catch (AbsentInformationException e) {
            // compilado sin -g: no hay variables para mostrar
        }
        return new Frame(id, loc.declaringType().name(), loc.method().name(), sourcePath(loc), loc.lineNumber(), locals);
    }

    /** El `args` del main de la clase principal no se muestra (ver contrato). */
    private boolean isMainArgs(Location loc, LocalVariable v) {
        return v.isArgument()
                && loc.method().name().equals("main")
                && loc.declaringType().name().equals(mainClass)
                && v.typeName().equals("java.lang.String[]");
    }

    private Map<String, List<Var>> statics(HeapReader heap) {
        Map<String, List<Var>> out = new LinkedHashMap<>();
        for (ReferenceType t : userTypes) {
            if (!t.isInitialized()) continue;
            List<Field> fields = t.fields().stream().filter(f -> f.isStatic() && !f.isSynthetic()).toList();
            if (fields.isEmpty()) continue;
            Map<Field, com.sun.jdi.Value> values = t.getValues(fields);
            out.put(t.name(), fields.stream().map(f -> new Var(f.name(), heap.value(values.get(f)))).toList());
        }
        return out;
    }

    private static ObjectReference thisOfTopFrame(ThreadReference thread) {
        try {
            return thread.frame(0).thisObject();
        } catch (IncompatibleThreadStateException e) {
            return null;
        }
    }

    /** Ajusta los ids de frames a la profundidad real (por si se perdió algún evento de entrada/salida). */
    private void syncFrameIds(int depth) {
        while (frameIds.size() > depth) frameIds.removeLast();
        while (frameIds.size() < depth) frameIds.add(newFrameId());
    }

    private String newFrameId() {
        return "f" + (++frameCounter);
    }

    // ------------------------------------------------------------------ salida

    /**
     * Lee lo que el programa escribió hasta ahora. Se hace con el programa
     * suspendido, así la salida queda asociada al paso correcto. (Un print()
     * sin salto de línea puede aparecer recién en el próximo println: así
     * bufferiza System.out.)
     */
    private void drainOutput() {
        drain(process.getInputStream());
        drain(process.getErrorStream());
    }

    private void drain(InputStream in) {
        try {
            int n;
            while ((n = in.available()) > 0) {
                byte[] bytes = in.readNBytes(n);
                int room = MAX_OUTPUT_BYTES - output.size();
                if (room <= 0) {
                    outputTruncated = true; // igual hay que leer, para que el programa no se bloquee
                    continue;
                }
                output.write(bytes, 0, Math.min(room, bytes.length));
                if (bytes.length > room) outputTruncated = true;
            }
        } catch (IOException ignored) {
            // el proceso terminó
        }
    }

    private String outputText() {
        String text = output.toString(StandardCharsets.UTF_8);
        return outputTruncated ? text + "\n[… salida truncada]" : text;
    }

    // ------------------------------------------------------------------ helpers

    private boolean isUser(ReferenceType type) {
        return userClasses.contains(type.name());
    }

    private static void exclude(EventRequest request) {
        for (String pattern : EXCLUDED) {
            switch (request) {
                case StepRequest r -> r.addClassExclusionFilter(pattern);
                case MethodEntryRequest r -> r.addClassExclusionFilter(pattern);
                case MethodExitRequest r -> r.addClassExclusionFilter(pattern);
                case ExceptionRequest r -> r.addClassExclusionFilter(pattern);
                case ClassPrepareRequest r -> r.addClassExclusionFilter(pattern);
                default -> throw new IllegalArgumentException(request.toString());
            }
        }
    }

    private static String sourcePath(Location loc) {
        try {
            return loc.sourcePath().replace(File.separatorChar, '/');
        } catch (AbsentInformationException e) {
            String name = loc.declaringType().name();
            int inner = name.indexOf('$');
            return (inner >= 0 ? name.substring(0, inner) : name).replace('.', '/') + ".java";
        }
    }

    private static String detailMessage(ObjectReference exc) {
        try {
            return HeapReader.get(exc, "detailMessage") instanceof StringReference s ? s.value() : null;
        } catch (IllegalStateException e) {
            return null;
        }
    }
}
