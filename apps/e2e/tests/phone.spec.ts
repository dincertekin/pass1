import { addItem, expect, registerNewAccount, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("on a phone: tab bar, filter chips, new-item button and full-screen detail", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Netflix", password: "summer2021" });
  await page.getByRole("button", { name: "Back" }).click();

  const tabBar = page.getByRole("navigation", { name: "Main" });
  await expect(tabBar).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Vault" })).toBeHidden();

  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill("GitHub");
  await page.getByLabel("Password", { exact: true }).fill("Xp4$wN7!rQ2zL9m#kV");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  // The weak password shows up as something to fix.
  await page.getByRole("button", { name: "1 to fix" }).click();
  await expect(page.getByRole("option")).toHaveText([/Netflix/]);

  await tabBar.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).first().click();

  await tabBar.getByRole("button", { name: "Generator" }).click();
  await expect(page.getByRole("dialog", { name: "Password generator" }).getByRole("button", { name: "Copy password" })).toBeVisible();
});
