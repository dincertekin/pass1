import { test as base, expect, type Page } from "@playwright/test";

// Shared setup for every test.
//
// The `page` fixture fails the test if the page reports a Content-Security-Policy violation
// or an uncaught error at any point. So every test is also a CSP test: if a change makes the
// app need something the policy forbids, some test here goes red.

export const MASTER_PASSWORD = "orbit lantern quiet harbor 47";

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.error(`CSP violation: ${e.effectiveDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile}:${e.lineNumber})`);
      });
    });
    page.on("console", (message) => {
      if (message.text().startsWith("CSP violation")) problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(`Uncaught: ${error.message}`));

    await use(page);

    expect(problems, "CSP violations or page errors").toEqual([]);
  },
});

export { expect };

/** Registers a fresh account and waits for the empty vault. Returns its email. */
export async function registerNewAccount(page: Page, password = MASTER_PASSWORD): Promise<string> {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Master password", { exact: true }).fill(password);
  await expect(page.getByText("Strong")).toBeVisible();
  await page.getByLabel("Confirm master password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your vault is empty")).toBeVisible();
  return email;
}

export async function logIn(page: Page, email: string, password = MASTER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Master password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function unlock(page: Page, password = MASTER_PASSWORD) {
  await page.getByLabel("Master password").fill(password);
  await page.getByRole("button", { name: "Unlock" }).click();
}

export async function addItem(page: Page, item: { name: string; password: string; username?: string; url?: string; notes?: string }) {
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(item.name);
  if (item.username) await page.getByLabel("Username").fill(item.username);
  await page.getByLabel("Password", { exact: true }).fill(item.password);
  if (item.url) await page.getByLabel("Website").fill(item.url);
  if (item.notes) await page.getByLabel("Notes").fill(item.notes);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: item.name })).toBeVisible();
}

export async function openSettings(page: Page) {
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}
