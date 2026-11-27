import { addItem, expect, lockVault, logOut, MASTER_PASSWORD, registerNewAccount, test, unlock } from "./fixtures";
import { secretsInMemory } from "./heap";
import { canKeepToken, launchDesktop, newUserDataDir } from "./desktop";

// The desktop app: the web app running from inside Electron, with API requests sent by the
// main process. Accounts are created on the web (sign-up links open in a browser).

async function logInOnDesktop(desktopPage: import("@playwright/test").Page, email: string) {
  await desktopPage.getByLabel("Email").fill(email);
  await desktopPage.getByLabel("Master password").fill(MASTER_PASSWORD);
  await desktopPage.getByRole("button", { name: "Log in" }).click();
}

test("logs in, shows items from the web, and the page never holds the session token", async ({ page }) => {
  const email = await registerNewAccount(page);
  await addItem(page, { name: "GitHub", password: "gh-secret-111" });

  const { app, desktopPage, problems } = await launchDesktop(newUserDataDir());
  await logInOnDesktop(desktopPage, email);
  await expect(desktopPage.getByRole("option", { name: /GitHub/ })).toBeVisible();

  const exposed = await desktopPage.evaluate(() => ({
    node: [typeof (window as unknown as { require?: unknown }).require, typeof (window as unknown as { process?: unknown }).process],
    cookie: document.cookie,
    storage: Object.keys(localStorage).filter((key) => key !== "pass1.settings"),
    bridge: Object.keys((window as unknown as { pass1Desktop: object }).pass1Desktop).sort(),
  }));
  expect(exposed).toEqual({ node: ["undefined", "undefined"], cookie: "", storage: [], bridge: ["onLockRequested", "request"] });

  // The server knows this session as the desktop app's, named after the computer.
  const sessions = (await (await page.request.get("/api/account/sessions")).json()).sessions;
  expect(sessions.filter((s: { deviceName: string | null }) => s.deviceName !== null)).toHaveLength(1);

  expect(problems).toEqual([]);
  await app.close();
});

test("the page can't reach the network, open windows or leave the app", async ({ page }) => {
  const email = await registerNewAccount(page);
  const { app, desktopPage } = await launchDesktop(newUserDataDir());
  await logInOnDesktop(desktopPage, email);
  await expect(desktopPage.getByRole("heading", { name: "Welcome to pass1. Let's fill your vault." })).toBeVisible();

  // Record what would open in the system browser instead of opening it.
  await app.evaluate(({ shell }) => {
    (globalThis as unknown as { opened: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });

  const fetched = await desktopPage.evaluate(() => fetch("https://example.com/").then(() => "reached", () => "blocked"));
  expect(fetched).toBe("blocked");

  await desktopPage.evaluate(() => window.open("https://example.com/new-window"));
  await desktopPage.evaluate(() => (window.location.href = "https://example.com/navigate"));
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([
    "https://example.com/new-window",
    "https://example.com/navigate",
  ]);
  expect(app.windows()).toHaveLength(1);
  expect(desktopPage.url()).toMatch(/^app:\/\/pass1\//);
  await app.close();
});

test("locks the vault when the computer goes to sleep", async ({ page }) => {
  const email = await registerNewAccount(page);
  const { app, desktopPage } = await launchDesktop(newUserDataDir());
  await logInOnDesktop(desktopPage, email);
  await expect(desktopPage.getByRole("heading", { name: "Welcome to pass1. Let's fill your vault." })).toBeVisible();

  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("suspend"));
  await expect(desktopPage.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
  await app.close();
});

test("stays logged in after a restart where the OS can encrypt the token, until logging out", async ({ page }) => {
  const email = await registerNewAccount(page);
  const userDataDir = newUserDataDir();

  const first = await launchDesktop(userDataDir);
  await logInOnDesktop(first.desktopPage, email);
  await expect(first.desktopPage.getByRole("heading", { name: "Welcome to pass1. Let's fill your vault." })).toBeVisible();
  const keepsToken = await canKeepToken(first.app);
  await first.app.close();

  const second = await launchDesktop(userDataDir);
  // Without real encryption the token was never written to disk, so it's a fresh login.
  const expected = keepsToken ? "Unlock your vault" : "Log in to pass1";
  await expect(second.desktopPage.getByRole("heading", { name: expected })).toBeVisible();
  if (!keepsToken) return void (await second.app.close());

  // Logging out forgets the token, so the next start asks to log in.
  await unlock(second.desktopPage);
  await logOut(second.desktopPage);
  await second.app.close();
  const third = await launchDesktop(userDataDir);
  await expect(third.desktopPage.getByRole("heading", { name: "Log in to pass1" })).toBeVisible();
  await third.app.close();
});

// The same promise as the web's heap test (security.spec.ts), in the desktop app's page. The main
// process never sees the vault key or a decrypted item: it only passes ciphertext along.
test("a locked desktop vault holds no keys or plaintext in memory", async ({ page }) => {
  const itemPassword = "Zq-desktop-heap-marker-4418";
  const email = await registerNewAccount(page);
  const { app, desktopPage } = await launchDesktop(newUserDataDir());
  await logInOnDesktop(desktopPage, email);
  await expect(desktopPage.getByRole("heading", { name: "Welcome to pass1. Let's fill your vault." })).toBeVisible();
  await addItem(desktopPage, { name: "Heap marker", password: itemPassword });
  await desktopPage.getByRole("button", { name: "Show password" }).click();
  await expect(desktopPage.getByText(itemPassword)).toBeVisible();

  const cdp = await desktopPage.context().newCDPSession(desktopPage);
  const unlocked = await secretsInMemory(cdp, [itemPassword]);
  expect(unlocked.cryptoKeys, "the vault key while unlocked").toBeGreaterThan(0);
  expect(unlocked.strings[itemPassword], "the item password while unlocked").toBeGreaterThan(0);

  await lockVault(desktopPage);
  const locked = await secretsInMemory(cdp, [itemPassword, MASTER_PASSWORD]);
  expect(locked).toEqual({ cryptoKeys: 0, strings: { [itemPassword]: 0, [MASTER_PASSWORD]: 0 } });
  await app.close();
});
