import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";
import { hasPermission } from "@task-tracker/shared";

describe("tokens", () => {
  it("generates unique url-safe tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[\w-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(48);
  });

  it("hashes deterministically and irreversibly", () => {
    const token = generateToken();
    expect(hashToken(token)).toEqual(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("hasPermission", () => {
  it("owner bypasses all permission checks", () => {
    const owner = { isOwner: true, permissions: new Set<string>() };
    expect(hasPermission(owner, "role.manage")).toBe(true);
  });

  it("non-owner needs the explicit permission", () => {
    const member = { isOwner: false, permissions: new Set(["task.create"]) };
    expect(hasPermission(member, "task.create")).toBe(true);
    expect(hasPermission(member, "role.manage")).toBe(false);
  });
});
