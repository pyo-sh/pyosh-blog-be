import { createAdminManagerContext } from "./admin-manager/db";
import { AdminManagerTui } from "./admin-manager/tui";

async function main() {
  const context = await createAdminManagerContext();
  const tui = new AdminManagerTui(context.service);

  try {
    await tui.run();
  } finally {
    tui.close();
    await context.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "Cancelled by user." || message === "readline was closed") {
    process.exit(0);
  }

  console.error(`[Admin Manager] ${message}`);
  process.exit(1);
});
