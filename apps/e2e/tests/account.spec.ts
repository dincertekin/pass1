import { readFile } from "node:fs/promises";
import { addItem, expect, logIn, logOut, MASTER_PASSWORD, openSettings, registerNewAccount, test } from "./fixtures";

const NEW_PASSWORD = "velvet canyon drift seventeen owl";

test("changing the master password: old one stops working, items still decrypt, other devices are logged out", async ({
  page,
  browser,
}) => {
  const email = await registerNewAccount(page);
  await addItem(page, { name: "Bank", password: "bank-secret-333" });

  // Another device, logged in with the old password.
  const otherDevice = await (await browser.newContext()).newPage();
  await logIn(otherDevice, email);
  await expect(otherDevice.getByRole("option", { name: /Bank/ })).toBeVisible();

  const settings = await openSettings(page, "Security");
  await settings.getByRole("button", { name: "Change…" }).click();
  // It opens inside the Settings window: still exactly one dialog.
  await expect(settings.getByRole("heading", { name: "Change master password" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await settings.getByLabel("Current master password").fill(MASTER_PASSWORD);
  await settings.getByLabel("New master password", { exact: true }).fill(NEW_PASSWORD);
  await settings.getByLabel("Confirm new master password").fill(NEW_PASSWORD);
  await settings.getByRole("button", { name: "Change master password" }).click();
  await expect(settings.getByText("Master password changed")).toBeVisible();
  await settings.getByRole("button", { name: "Done" }).click();
  // Back on the Security tab.
  await expect(settings.getByRole("heading", { name: "Security" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The other device is logged out on its next request.
  await otherDevice.reload();
  await expect(otherDevice).toHaveURL(/\/login$/);

  await logOut(page);
  await logIn(page, email);
  await expect(page.getByText("Email or master password is incorrect.")).toBeVisible();
  await logIn(page, email, NEW_PASSWORD);
  await page.getByRole("option", { name: /Bank/ }).click();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByText("bank-secret-333")).toBeVisible();
});

test("export to an encrypted file and import it back", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "GitHub", password: "gh-secret-111" });
  const settings = await openSettings(page, "Import & export");

  await settings.getByRole("button", { name: "Export…" }).click();
  await expect(settings.getByRole("heading", { name: "Export your vault" })).toBeVisible();
  await settings.getByLabel("Password for this file").fill("export lantern copper nine");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings.getByRole("button", { name: "Download export" }).click(),
  ]);
  const file = await readFile((await download.path())!, "utf8");
  expect(file).toContain('"format": "pass1-export"');
  expect(file).not.toMatch(/GitHub|gh-secret/);
  await settings.getByRole("button", { name: "Done" }).click();

  await settings.getByRole("button", { name: /pass1 export/ }).click();
  await expect(settings.getByRole("heading", { name: "Import from pass1 export" })).toBeVisible();
  await settings.locator('input[type="file"]').setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await settings.getByLabel("Password for this file").fill("not the export password");
  await settings.getByRole("button", { name: "Continue" }).click();
  await expect(settings.getByText("Wrong password for this file")).toBeVisible();

  await settings.getByLabel("Password for this file").fill("export lantern copper nine");
  await settings.getByRole("button", { name: "Continue" }).click();
  await settings.getByRole("button", { name: "Import 1 item" }).click();
  await expect(settings.getByText("Imported 1 item.")).toBeVisible();
  await settings.getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: /GitHub/ })).toHaveCount(2);
});

test("deleting the account needs the master password and removes everything", async ({ page }) => {
  const email = await registerNewAccount(page);
  const settings = await openSettings(page, "Account");
  await settings.getByRole("button", { name: "Delete account…" }).click();
  await expect(settings.getByRole("heading", { name: "Delete your account" })).toBeVisible();

  await settings.getByLabel("Master password").fill("wrong");
  await settings.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(settings.getByText("Master password is incorrect.")).toBeVisible();

  await settings.getByLabel("Master password").fill(MASTER_PASSWORD);
  await settings.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, email);
  await expect(page.getByText("Email or master password is incorrect.")).toBeVisible();
});

test("the plans dialog shows prices and explains that upgrades aren't open yet", async ({ page }) => {
  await registerNewAccount(page);
  await page.getByRole("button", { name: "Get pass1 Plus →" }).click();
  const dialog = page.getByRole("dialog", { name: "pass1 plans" });
  await expect(dialog.getByText("Your plan")).toBeVisible();
  await expect(dialog.getByText("$19")).toBeVisible();
  await expect(dialog.getByText("$39")).toBeVisible();
  await expect(dialog.getByText("or $2.49 billed monthly")).toBeVisible();
  await expect(dialog.getByText("Upgrades open soon.", { exact: false })).toBeVisible();
  // One way to close: the ✕.
  await expect(dialog.getByRole("button", { name: /close/i })).toHaveCount(1);
});

test("opening the plans from Settings replaces Settings instead of stacking on it", async ({ page }) => {
  await registerNewAccount(page);
  const settings = await openSettings(page, "Account");
  await settings.getByRole("button", { name: "Get pass1 Plus" }).click();
  await expect(page.getByRole("dialog", { name: "pass1 plans" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});
