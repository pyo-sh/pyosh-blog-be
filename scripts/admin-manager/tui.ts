import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AdminRecord, AdminManagerService } from "./service";
import { parseAdminId } from "./validators";

type MenuAction =
  | "refresh"
  | "view"
  | "create"
  | "rename"
  | "password"
  | "delete"
  | "quit";

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString();
}

async function promptPassword(
  rl: readline.Interface,
  label: string,
): Promise<string> {
  return rl.question(label);
}

export class AdminManagerTui {
  private readonly rl = readline.createInterface({ input, output });

  constructor(private readonly service: AdminManagerService) {}

  async run(): Promise<void> {
    let shouldContinue = true;

    while (shouldContinue) {
      try {
        const admins = await this.service.listAdmins();
        this.renderAdmins(admins);

        const action = await this.promptMenu();

        switch (action) {
          case "refresh":
            break;
          case "view":
            await this.handleView();
            break;
          case "create":
            await this.handleCreate();
            break;
          case "rename":
            await this.handleRename();
            break;
          case "password":
            await this.handlePasswordChange();
            break;
          case "delete":
            await this.handleDelete();
            break;
          case "quit":
            shouldContinue = false;
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message === "Cancelled by user." || message === "readline was closed") {
          shouldContinue = false;
          continue;
        }

        console.log("");
        console.error(`Error: ${message}`);
        await this.pause();
      }
    }
  }

  close(): void {
    this.rl.close();
  }

  private renderAdmins(admins: AdminRecord[]): void {
    console.clear();
    console.log("Admin Manager");
    console.log(`NODE_ENV=${process.env.NODE_ENV ?? "development"}`);
    console.log("");

    if (admins.length === 0) {
      console.log("No admins found.");
    } else {
      console.table(
        admins.map((admin) => ({
          id: admin.id,
          username: admin.username,
          createdAt: formatDate(admin.createdAt),
          updatedAt: formatDate(admin.updatedAt),
          lastLoginAt: formatDate(admin.lastLoginAt),
        })),
      );
    }
  }

  private async promptMenu(): Promise<MenuAction> {
    console.log("1. Refresh");
    console.log("2. View admin details");
    console.log("3. Create admin");
    console.log("4. Rename admin");
    console.log("5. Change password");
    console.log("6. Delete admin");
    console.log("7. Quit");

    const answer = (await this.rl.question("Select action: ")).trim();

    switch (answer) {
      case "1":
        return "refresh";
      case "2":
        return "view";
      case "3":
        return "create";
      case "4":
        return "rename";
      case "5":
        return "password";
      case "6":
        return "delete";
      case "7":
        return "quit";
      default:
        throw new Error("Unknown menu selection.");
    }
  }

  private async handleView(): Promise<void> {
    const id = await this.promptAdminId();
    const admin = await this.service.getAdminById(id);

    console.log("");
    console.table([
      {
        id: admin.id,
        username: admin.username,
        createdAt: formatDate(admin.createdAt),
        updatedAt: formatDate(admin.updatedAt),
        lastLoginAt: formatDate(admin.lastLoginAt),
      },
    ]);

    await this.pause();
  }

  private async handleCreate(): Promise<void> {
    const username = await this.rl.question("Username: ");
    const password = await promptPassword(this.rl, "Password: ");
    const passwordConfirmation = await promptPassword(
      this.rl,
      "Confirm password: ",
    );

    const admin = await this.service.createAdmin({
      username,
      password,
      passwordConfirmation,
    });

    console.log(`Created admin ${admin.username} (#${admin.id}).`);
    await this.pause();
  }

  private async handleRename(): Promise<void> {
    const id = await this.promptAdminId();
    const current = await this.service.getAdminById(id);
    const username = await this.rl.question(
      `New username for ${current.username}: `,
    );

    const admin = await this.service.updateAdminUsername(id, { username });
    console.log(`Updated username to ${admin.username}.`);
    await this.pause();
  }

  private async handlePasswordChange(): Promise<void> {
    const id = await this.promptAdminId();
    const current = await this.service.getAdminById(id);
    const confirmation = await this.rl.question(
      `Type "${current.username}" to confirm password change: `,
    );

    if (confirmation.trim() !== current.username) {
      throw new Error("Username confirmation did not match.");
    }

    const password = await promptPassword(this.rl, "New password: ");
    const passwordConfirmation = await promptPassword(
      this.rl,
      "Confirm new password: ",
    );

    await this.service.changeAdminPassword(id, {
      password,
      passwordConfirmation,
    });

    console.log(`Password updated for ${current.username}.`);
    await this.pause();
  }

  private async handleDelete(): Promise<void> {
    const id = await this.promptAdminId();
    const current = await this.service.getAdminById(id);
    const confirmation = await this.rl.question(
      `Type "${current.username}" to confirm delete: `,
    );

    if (confirmation.trim() !== current.username) {
      throw new Error("Username confirmation did not match.");
    }

    const finalConfirmation = await this.rl.question(
      `Delete ${current.username}? Type "delete" to continue: `,
    );

    if (finalConfirmation.trim().toLowerCase() !== "delete") {
      throw new Error("Delete cancelled.");
    }

    await this.service.deleteAdmin(id);
    console.log(`Deleted admin ${current.username}.`);
    await this.pause();
  }

  private async promptAdminId(): Promise<number> {
    const answer = await this.rl.question("Admin ID: ");
    return parseAdminId(answer);
  }

  private async pause(): Promise<void> {
    await this.rl.question("Press Enter to continue...");
  }
}
