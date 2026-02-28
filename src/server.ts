// import "reflect-metadata"; // Not needed for current stack
import { buildApp } from "@src/app";
import { env } from "@src/shared/env";

async function start() {
  try {
    const app = await buildApp();

    await app.ready();

    // 프로세스 예외 처리 (uncaughtException / unhandledRejection)
    process.on("uncaughtException", (error) => {
      app.log.error({ err: error }, "Uncaught exception — shutting down");
      app.close().finally(() => process.exit(1));
    });

    process.on("unhandledRejection", (reason) => {
      app.log.error({ reason }, "Unhandled promise rejection — shutting down");
      app.close().finally(() => process.exit(1));
    });

    const signals = ["SIGINT", "SIGTERM"] as const;
    signals.forEach((signal) => {
      process.on(signal, async () => {
        app.log.info(`Received ${signal}, shutting down gracefully`);
        await app.close();
        process.exit(0);
      });
    });

    process.once("SIGUSR2", async () => {
      app.log.info("Received SIGUSR2, shutting down gracefully");
      await app.close();
      process.kill(process.pid, "SIGUSR2");
    });

    // 서버 시작
    await app.listen({
      port: env.SERVER_PORT,
      host: "0.0.0.0",
    });

    app.log.info(`[Fastify] Server listening on port ${env.SERVER_PORT}`);
  } catch (err) {
    console.error("[Server] Failed to start:", err);
    process.exit(1);
  }
}

start();
