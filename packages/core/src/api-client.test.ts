import { describe, expect, it } from "vitest";
import { ApiRequestError, createApiClient } from "./api-client";

/** A fetch that records requests and answers every one with `status` and `body`. */
function fakeFetch(status: number, body: unknown) {
  const requests: { url: string; method: string }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

const ACCOUNT = {
  user: { id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", email: "ada@example.com", plan: "free" },
  kdfSalt: "AAECAwQFBgcICQoLDA0ODw==",
  kdfParams: { memoryKiB: 65_536, iterations: 3, parallelism: 1 },
  wrappedVaultKey: { v: 1, iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" },
};

describe("Talking to the API", () => {
  it("sends requests to the server it was given, as a phone app needs", async () => {
    const { fetch, requests } = fakeFetch(200, ACCOUNT);
    await createApiClient({ baseUrl: "https://pass1.example.com/api", fetch }).me();
    expect(requests).toEqual([{ url: "https://pass1.example.com/api/auth/me", method: "GET" }]);
  });

  it("sends an app's token in the Authorization header, and the web sends none", async () => {
    const seen: (string | null)[] = [];
    const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return new Response(JSON.stringify(ACCOUNT), { status: 200 });
    }) as typeof globalThis.fetch;
    await createApiClient({ baseUrl: "https://pass1.example.com/api", fetch, getSessionToken: () => "app-token" }).me();
    await createApiClient({ baseUrl: "/api", fetch }).me();
    expect(seen).toEqual(["Bearer app-token", null]);
  });

  it("tells the server which app and version is asking, and the web doesn't", async () => {
    const seen: (string | null)[] = [];
    const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("pass1-client"));
      return new Response(JSON.stringify(ACCOUNT), { status: 200 });
    }) as typeof globalThis.fetch;
    await createApiClient({ baseUrl: "https://pass1.example.com/api", fetch, client: { platform: "ios", version: "1.4.0" } }).me();
    await createApiClient({ baseUrl: "/api", fetch }).me();
    expect(seen).toEqual(["ios/1.4.0", null]);
  });

  it("tells the app when the server says the session is over", async () => {
    const { fetch } = fakeFetch(401, { error: { code: "UNAUTHENTICATED", message: "Log in to continue." } });
    const client = createApiClient({ baseUrl: "/api", fetch });
    let ended = false;
    client.setSessionEndedHandler(() => (ended = true));
    await expect(client.me()).rejects.toThrow(ApiRequestError);
    expect(ended).toBe(true);
  });

  it("refuses a server that sends weak Argon2 settings to make passwords easier to crack", async () => {
    const weak = { ...ACCOUNT, kdfParams: { memoryKiB: 1024, iterations: 1, parallelism: 1 } };
    const { fetch } = fakeFetch(200, weak);
    await expect(createApiClient({ baseUrl: "/api", fetch }).me()).rejects.toThrow("The server sent an unexpected response.");
  });

  it("explains a network failure in words a person understands", async () => {
    const fetch = (async () => Promise.reject(new TypeError("Failed to fetch"))) as typeof globalThis.fetch;
    await expect(createApiClient({ baseUrl: "/api", fetch }).me()).rejects.toThrow("Can't reach pass1. Check your connection and try again.");
  });
});
