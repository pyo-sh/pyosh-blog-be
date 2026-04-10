import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "@src/routes/settings/settings.service";

function createMissingTableError(): Error {
  const error = new Error(
    "Failed query: select `guestbook_enabled` from `site_settings_tb`",
  ) as Error & { cause?: { code?: string; errno?: number } };
  error.cause = { code: "ER_NO_SUCH_TABLE", errno: 1146 };

  return error;
}

function getSqlString(value: unknown): string {
  const sqlChunk = (
    value as { queryChunks?: Array<{ value?: string }> } | undefined
  )?.queryChunks?.[0];

  return typeof sqlChunk?.value === "string" ? sqlChunk.value : "";
}

function createDbMock() {
  const limit = vi.fn();
  const from = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ from }));

  const onDuplicateKeyUpdate = vi.fn();
  const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
  const insert = vi.fn(() => ({ values }));

  const execute = vi.fn();

  return {
    db: { select, insert, execute },
    select,
    limit,
    onDuplicateKeyUpdate,
    execute,
  };
}

describe("SettingsService", () => {
  it("recreates site settings table on read when missing", async () => {
    const mock = createDbMock();
    mock.limit
      .mockRejectedValueOnce(createMissingTableError())
      .mockResolvedValueOnce([{ guestbookEnabled: true }]);
    const service = new SettingsService(mock.db as never);

    const enabled = await service.getGuestbookEnabled();

    expect(enabled).toBe(true);
    expect(mock.execute).toHaveBeenCalledTimes(2);
    expect(getSqlString(mock.execute.mock.calls[0]?.[0])).toContain(
      "CREATE TABLE IF NOT EXISTS `site_settings_tb`",
    );
    expect(getSqlString(mock.execute.mock.calls[1]?.[0])).toContain(
      "INSERT IGNORE INTO `site_settings_tb`",
    );
    expect(mock.select).toHaveBeenCalledTimes(2);
  });

  it("retries setting update after creating the missing table", async () => {
    const mock = createDbMock();
    mock.onDuplicateKeyUpdate
      .mockRejectedValueOnce(createMissingTableError())
      .mockResolvedValueOnce(undefined);
    const service = new SettingsService(mock.db as never);

    await service.setGuestbookEnabled(false);

    expect(mock.execute).toHaveBeenCalledTimes(2);
    expect(mock.onDuplicateKeyUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not swallow unrelated database errors", async () => {
    const mock = createDbMock();
    const error = new Error("db down");
    mock.limit.mockRejectedValueOnce(error);
    const service = new SettingsService(mock.db as never);

    await expect(service.getGuestbookEnabled()).rejects.toThrow("db down");
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
