import { addItem, expect, lockVault, logIn, logOut, MASTER_PASSWORD, registerNewAccount, test } from "./fixtures";
import { secretsInMemory } from "./heap";

const ITEM_PASSWORD = "Zq-heap-marker-7731-secret";

// The core promise of locking: afterwards, this tab holds neither the vault key, nor any decrypted
// item, nor the master password (which the register screen's strength meter has just checked).
// The first snapshot (unlocked) proves the check can see the key and the item at all.
test("a locked vault holds no keys or plaintext in memory", async ({ page, context }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Heap marker", password: ITEM_PASSWORD });
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByText(ITEM_PASSWORD)).toBeVisible();

  const cdp = await context.newCDPSession(page);
  const unlocked = await secretsInMemory(cdp, [ITEM_PASSWORD]);
  expect(unlocked.cryptoKeys, "the vault key while unlocked").toBeGreaterThan(0);
  expect(unlocked.strings[ITEM_PASSWORD], "the item password while unlocked").toBeGreaterThan(0);

  await lockVault(page);

  const locked = await secretsInMemory(cdp, [ITEM_PASSWORD, MASTER_PASSWORD]);
  expect(locked).toEqual({ cryptoKeys: 0, strings: { [ITEM_PASSWORD]: 0, [MASTER_PASSWORD]: 0 } });
});

test("locking clears a copied password from the clipboard", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "GitHub", password: "gh-secret-111" });
  await page.getByRole("button", { name: "Copy password" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("gh-secret-111");

  await lockVault(page);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("");
});

test("the vault locks itself after 15 idle minutes", async ({ page }) => {
  const email = await registerNewAccount(page);
  await logOut(page);

  // A fake clock, installed before the app loads, so 15 minutes pass in an instant.
  await page.clock.install();
  await logIn(page, email);
  await expect(page.getByText("Locks in 15:00")).toBeVisible();

  await page.clock.fastForward("14:00");
  await expect(page.getByText("Locks in 1:00")).toBeVisible();
  await page.clock.fastForward("01:10");
  await expect(page.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
});

test("every response carries the strict security headers", async ({ request }) => {
  for (const url of ["/", "/vault", "/api/health"]) {
    const res = await request.get(url);
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp, url).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp, url).toContain("require-trusted-types-for 'script'");
    expect(csp, url).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
    expect(res.headers()["strict-transport-security"], url).toContain("max-age=31536000");
  }
});

test("⌘L locks and ⌘, opens Settings", async ({ page }) => {
  await registerNewAccount(page);
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+l");
  await expect(page.getByRole("heading", { name: "Unlock your vault" })).toBeVisible();
});
