// import "reflect-metadata"; // Not needed for current stack
import { buildApp } from "@src/app";
import { env } from "@src/shared/env";

async function start() {
  try {
    const app = await buildApp();

    await app.ready();

    const signals = ["SIGINT", "SIGTERM"] as const;
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(
          `\n[Server] Received ${signal}, shutting down gracefully...`,
        );
        await app.close();
        process.exit(0);
      });
    });

    process.once("SIGUSR2", async () => {
      console.log(`\n[Server] Received SIGUSR2, shutting down gracefully...`);
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
