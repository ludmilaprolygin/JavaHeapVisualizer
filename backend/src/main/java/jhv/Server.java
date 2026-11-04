package jhv;

import com.fasterxml.jackson.core.JacksonException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import jhv.Model.RunRequest;
import jhv.Model.Trace;

/**
 * Servidor HTTP del backend.
 *
 *   POST /api/run     cuerpo: RunRequest (JSON)  ->  200 Trace | 400 texto | 500 texto
 *   GET  /api/health  ->  "ok"
 *
 * Escucha SOLO en localhost: ejecuta código arbitrario, no debe quedar expuesto en la red.
 * Puerto: variable de entorno JHV_PORT (por defecto 7070).
 */
public final class Server {
    private static final int MAX_BODY_BYTES = 5_000_000;
    /** Ejecuciones simultáneas (cada una es una JVM aparte). */
    private static final int WORKERS = 2;

    private Server() {}

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("JHV_PORT", "7070"));
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        server.setExecutor(Executors.newFixedThreadPool(WORKERS));
        server.createContext("/api/health", ex -> {
            try (ex) {
                send(ex, 200, "text/plain", "ok".getBytes(StandardCharsets.UTF_8));
            }
        });
        server.createContext("/api/run", Server::handleRun);
        server.start();
        System.out.println("Backend escuchando en http://localhost:" + port + " (POST /api/run)");
    }

    private static void handleRun(HttpExchange ex) throws IOException {
        try (ex) {
            if (!ex.getRequestMethod().equals("POST")) {
                text(ex, 405, "Usá POST");
                return;
            }
            byte[] body;
            try (InputStream in = ex.getRequestBody()) {
                body = in.readNBytes(MAX_BODY_BYTES + 1);
            }
            if (body.length > MAX_BODY_BYTES) {
                text(ex, 413, "El pedido es demasiado grande.");
                return;
            }

            long start = System.nanoTime();
            RunRequest request;
            try {
                request = Model.JSON.readValue(body, RunRequest.class);
            } catch (JacksonException e) {
                text(ex, 400, "JSON inválido: " + e.getOriginalMessage());
                return;
            }
            try {
                Trace trace = Runner.run(request);
                send(ex, 200, "application/json", Model.JSON.writeValueAsBytes(trace));
                System.out.printf("run %s: %s, %d pasos, %d ms%n", trace.mainClass(), trace.status(),
                        trace.steps().size(), (System.nanoTime() - start) / 1_000_000);
            } catch (Runner.BadRequest e) {
                text(ex, 400, e.getMessage());
            } catch (Exception e) {
                e.printStackTrace();
                text(ex, 500, "Error interno del backend: " + e);
            }
        }
    }

    private static void text(HttpExchange ex, int status, String message) throws IOException {
        send(ex, status, "text/plain; charset=utf-8", message.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpExchange ex, int status, String contentType, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", contentType);
        ex.sendResponseHeaders(status, body.length);
        ex.getResponseBody().write(body);
    }
}
