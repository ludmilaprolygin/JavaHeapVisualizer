package jhv;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.ToolProvider;

/** Compila los fuentes del usuario con javac embebido, con info de depuración completa. */
final class Compiler {
    private Compiler() {}

    record Error(String file, long line, long column, String message) {}

    /** Devuelve la lista de errores (vacía si compiló). */
    static List<Error> compile(Path srcDir, List<Path> sources, Path outDir) throws IOException {
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        if (javac == null) {
            throw new IllegalStateException("El backend tiene que correr con un JDK (no un JRE): falta javac.");
        }
        var diagnostics = new DiagnosticCollector<JavaFileObject>();
        try (var fm = javac.getStandardFileManager(diagnostics, Locale.getDefault(), UTF_8)) {
            List<String> options = List.of(
                    "-g", // líneas, variables locales y archivo fuente: sin esto JDI no ve nombres
                    "-parameters",
                    "-encoding", "UTF-8",
                    "-proc:none",
                    "-Xlint:none",
                    "-d", outDir.toString());
            javac.getTask(null, fm, diagnostics, options, null, fm.getJavaFileObjectsFromPaths(sources)).call();
        }
        return diagnostics.getDiagnostics().stream()
                .filter(d -> d.getKind() == Diagnostic.Kind.ERROR)
                .map(d -> new Error(
                        relativePath(srcDir, d),
                        d.getLineNumber(),
                        d.getColumnNumber(),
                        d.getMessage(Locale.getDefault())))
                .toList();
    }

    private static String relativePath(Path srcDir, Diagnostic<? extends JavaFileObject> d) {
        if (d.getSource() == null) return null;
        Path p = Path.of(d.getSource().toUri());
        return srcDir.relativize(p).toString().replace('\\', '/');
    }
}
