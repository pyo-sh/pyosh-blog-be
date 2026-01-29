// eslint-disable-next-line import/no-unresolved
import "reflect-metadata";
import { buildApp } from "@src/app";
import { env } from "@src/shared/env";

async function start() {
  try {
    const app = await buildApp();

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

// Graceful shutdown
const signals = ["SIGINT", "SIGTERM"] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  });
});

start();
