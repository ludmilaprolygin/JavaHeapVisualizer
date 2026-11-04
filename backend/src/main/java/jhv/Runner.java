package jhv;

import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import jhv.Model.ErrorInfo;
import jhv.Model.RunRequest;
import jhv.Model.SourceFile;
import jhv.Model.Trace;

/** Orquesta una ejecución: valida el pedido, compila, elige el main y traza. */
public final class Runner {
    public static final int MAX_STEPS = 1000;
    public static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final int MAX_FILES = 300;
    private static final int MAX_SOURCE_BYTES = 2_000_000;

    /** El pedido está mal formado (no es culpa del programa del usuario): HTTP 400. */
    public static final class BadRequest extends Exception {
        BadRequest(String message) {
            super(message);
        }
    }

    private Runner() {}

    public static Trace run(RunRequest request) throws BadRequest, IOException {
        List<SourceFile> files = validate(request);
        Path work = Files.createTempDirectory("jhv-");
        try {
            Path src = Files.createDirectories(work.resolve("src"));
            Path classes = Files.createDirectories(work.resolve("classes"));
            List<Path> sources = new ArrayList<>();
            for (SourceFile f : files) {
                Path p = src.resolve(f.path()).normalize();
                if (!p.startsWith(src)) throw new BadRequest("Ruta inválida: " + f.path());
                Files.createDirectories(p.getParent());
                Files.writeString(p, f.content(), StandardCharsets.UTF_8);
                sources.add(p);
            }

            List<Compiler.Error> errors = Compiler.compile(src, sources, classes);
            String requestedMain = request.mainClass() == null || request.mainClass().isBlank() ? null : request.mainClass();
            if (!errors.isEmpty()) return compileError(files, requestedMain, errors);

            Set<String> userClasses = compiledClasses(classes);
            List<String> mains = findMains(classes, userClasses);
            String mainClass;
            if (requestedMain != null) {
                if (!mains.contains(requestedMain)) {
                    return failure(files, requestedMain, "La clase " + requestedMain + " no tiene un método "
                            + "public static void main(String[] args)." + available(mains));
                }
                mainClass = requestedMain;
            } else if (mains.size() == 1) {
                mainClass = mains.getFirst();
            } else {
                return failure(files, "", mains.isEmpty()
                        ? "Ninguna clase tiene un método public static void main(String[] args)."
                        : "Hay varias clases con main: elegí cuál ejecutar." + available(mains));
            }

            Tracer.Result result = new Tracer(classes, mainClass, userClasses, MAX_STEPS, TIMEOUT).run();
            return new Trace(Model.TRACE_VERSION, files, mainClass, result.status(), result.error(), result.steps());
        } finally {
            deleteRecursively(work);
        }
    }

    // ------------------------------------------------------------------ validación

    private static List<SourceFile> validate(RunRequest request) throws BadRequest {
        if (request == null || request.files() == null || request.files().isEmpty()) {
            throw new BadRequest("El pedido no tiene archivos.");
        }
        if (request.files().size() > MAX_FILES) throw new BadRequest("Demasiados archivos (máximo " + MAX_FILES + ").");
        long bytes = 0;
        Set<String> paths = new HashSet<>();
        for (SourceFile f : request.files()) {
            if (f == null || f.path() == null || f.content() == null) throw new BadRequest("Archivo sin path o content.");
            String p = f.path();
            boolean ok = p.endsWith(".java") && !p.startsWith("/") && !p.contains("\\") && !p.contains(":")
                    && Stream.of(p.split("/")).noneMatch(s -> s.isEmpty() || s.equals(".") || s.equals(".."));
            if (!ok) throw new BadRequest("Ruta inválida (tiene que ser relativa, con / y terminar en .java): " + p);
            if (!paths.add(p)) throw new BadRequest("Archivo repetido: " + p);
            bytes += f.content().getBytes(StandardCharsets.UTF_8).length;
        }
        if (bytes > MAX_SOURCE_BYTES) throw new BadRequest("El código es demasiado grande.");
        return List.copyOf(request.files());
    }

    // ------------------------------------------------------------------ main

    /** Nombres binarios ("com.x.A", "com.x.A$Interna") de todo lo compilado. */
    private static Set<String> compiledClasses(Path classes) throws IOException {
        try (Stream<Path> walk = Files.walk(classes)) {
            return walk.filter(p -> p.toString().endsWith(".class"))
                    .map(p -> classes.relativize(p).toString().replace('\\', '/'))
                    .map(p -> p.substring(0, p.length() - ".class".length()).replace('/', '.'))
                    .collect(Collectors.toUnmodifiableSet());
        }
    }

    /**
     * Clases de primer nivel con public static void main(String[]). Se cargan
     * sin inicializar (no corre código del usuario acá).
     */
    private static List<String> findMains(Path classes, Set<String> userClasses) throws IOException {
        List<String> mains = new ArrayList<>();
        try (var loader = new URLClassLoader(new URL[] {classes.toUri().toURL()}, Runner.class.getClassLoader().getParent())) {
            for (String name : userClasses) {
                if (name.contains("$")) continue;
                try {
                    Method m = Class.forName(name, false, loader).getDeclaredMethod("main", String[].class);
                    int mod = m.getModifiers();
                    if (Modifier.isStatic(mod) && Modifier.isPublic(mod) && m.getReturnType() == void.class) mains.add(name);
                } catch (NoSuchMethodException | LinkageError | ClassNotFoundException ignored) {
                    // sin main
                }
            }
        }
        mains.sort(Comparator.naturalOrder());
        return mains;
    }

    private static String available(List<String> mains) {
        return mains.isEmpty() ? "" : " Clases con main: " + String.join(", ", mains) + ".";
    }

    // ------------------------------------------------------------------ resultados sin ejecución

    private static Trace compileError(List<SourceFile> files, String mainClass, List<Compiler.Error> errors) {
        String message = errors.stream()
                .map(e -> (e.file() != null ? e.file() + ":" + e.line() + ": " : "") + e.message())
                .collect(Collectors.joining("\n"));
        Compiler.Error first = errors.getFirst();
        ErrorInfo info = new ErrorInfo(message, first.file(),
                first.line() > 0 ? (int) first.line() : null,
                first.column() > 0 ? (int) first.column() : null);
        return new Trace(Model.TRACE_VERSION, files, mainClass == null ? "" : mainClass, "compile_error", info, List.of());
    }

    private static Trace failure(List<SourceFile> files, String mainClass, String message) {
        return new Trace(Model.TRACE_VERSION, files, mainClass, "compile_error",
                new ErrorInfo(message, null, null, null), List.of());
    }

    private static void deleteRecursively(Path dir) {
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException ignored) {
            // es un directorio temporal
        }
    }
}
