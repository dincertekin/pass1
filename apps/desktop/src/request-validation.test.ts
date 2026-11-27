import { describe, expect, it } from "vitest";
import { validateRequest } from "./request-validation";

const valid = (path: string, method = "GET", body: string | null = null) => validateRequest({ method, path, body });

describe("Requests the page may hand to the main process", () => {
  it("lets the API's own requests through unchanged", () => {
    expect(valid("/vault/items?since=0")).toEqual({ method: "GET", path: "/vault/items?since=0", body: null });
    expect(valid("/auth/login", "POST", '{"email":"ada@example.com"}')).not.toBeNull();
    expect(valid(`/account/sessions/${"a".repeat(64)}`, "DELETE")).not.toBeNull();
  });

  it("refuses paths that would climb out of /api, however they're spelled", () => {
    for (const path of ["/../admin", "/%2e%2e/admin", "/%2E%2E/%2e%2e/etc", "/.%2e/admin", "/vault/../../x"]) {
      expect(valid(path), path).toBeNull();
    }
  });

  it("refuses paths that could point at another server or aren't paths at all", () => {
    for (const path of ["//evil.example/x", "/@evil.example", "vault/items", "/vault\\\\items", "/vault items", "/vault#x"]) {
      expect(valid(path), path).toBeNull();
    }
  });

  it("refuses unknown methods, odd bodies and anything that isn't a request", () => {
    expect(valid("/auth/me", "PATCH")).toBeNull();
    expect(valid("/auth/login", "POST", "x".repeat(512 * 1024 + 1))).toBeNull();
    expect(validateRequest({ method: "POST", path: "/auth/login", body: { email: "x" } })).toBeNull();
    expect(validateRequest(null)).toBeNull();
    expect(validateRequest("GET /auth/me")).toBeNull();
  });
});
