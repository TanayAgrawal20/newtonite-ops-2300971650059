import { describe, expect, it } from "vitest";
import {
  decodeWorkItemCursor,
  encodeWorkItemCursor,
} from "./work-items.cursor";

describe("work item cursors", () => {
  it("round-trips a timestamp and id", () => {
    const createdAt = new Date("2024-06-15T12:34:56.789Z");
    const id = "11111111-1111-4111-8111-111111111111";

    const decoded = decodeWorkItemCursor(encodeWorkItemCursor(createdAt, id));

    expect(decoded.id).toBe(id);
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeWorkItemCursor("not-a-cursor")).toThrow("INVALID_CURSOR");
    expect(() =>
      decodeWorkItemCursor(Buffer.from("{}", "utf8").toString("base64url")),
    ).toThrow("INVALID_CURSOR");
  });
});
