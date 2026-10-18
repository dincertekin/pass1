import { readFile } from "node:fs/promises";
import { addItem, expect, logIn, MASTER_PASSWORD, openSettings, registerNewAccount, test } from "./fixtures";

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

  await openSettings(page);
  await page.getByLabel("Current master password").fill(MASTER_PASSWORD);
  await page.getByLabel("New master password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new master password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change master password" }).click();
  await expect(page.getByText("Master password changed")).toBeVisible();

  // The other device is logged out on its next request.
  await otherDevice.reload();
  await expect(otherDevice).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Vault" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
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
  await openSettings(page);

  await page.getByLabel("Password for this file").first().fill("export lantern copper nine");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download export" }).click(),
  ]);
  const file = await readFile((await download.path())!, "utf8");
  expect(file).toContain('"format": "pass1-export"');
  expect(file).not.toMatch(/GitHub|gh-secret/);

  await page.locator('input[type="file"]').setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const importPassword = page.getByLabel("Password for this file").nth(1);
  await importPassword.fill("not the export password");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Wrong password for this file")).toBeVisible();

  await importPassword.fill("export lantern copper nine");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported 1 item")).toBeVisible();
  await page.getByRole("link", { name: "Vault" }).click();
  await expect(page.getByRole("option", { name: /GitHub/ })).toHaveCount(2);
});

test("deleting the account needs the master password and removes everything", async ({ page }) => {
  const email = await registerNewAccount(page);
  await openSettings(page);
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog");

  await dialog.getByLabel("Master password").fill("wrong");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(dialog.getByText("Master password is incorrect.")).toBeVisible();

  await dialog.getByLabel("Master password").fill(MASTER_PASSWORD);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, email);
  await expect(page.getByText("Email or master password is incorrect.")).toBeVisible();
});
