import { addItem, expect, registerNewAccount, test, unlock } from "./fixtures";

test("create, search, reveal, copy and favorite items", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "GitHub", username: "ada-dev", password: "gh-secret-111", url: "github.com" });
  await addItem(page, { name: "Netflix", username: "ada@example.com", password: "nf-secret-222" });

  // "/" jumps to search; arrows and Enter work without leaving the keyboard.
  await page.locator("body").press("/");
  await page.keyboard.type("net");
  await expect(page.getByRole("option")).toHaveText([/Netflix/]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.getByRole("option", { name: /GitHub/ }).click();
  await expect(page.getByText("gh-secret-111")).toHaveCount(0);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByText("gh-secret-111")).toBeVisible();

  await page.getByRole("button", { name: "Copy password" }).click();
  // Anchored: Radix briefly adds a screen-reader copy ("Notification Password copied …")
  // that a looser pattern would also match.
  await expect(page.getByText(/^Password copied · clears in \d+s$/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("gh-secret-111");

  await page.getByRole("button", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: /^Favorites/ }).click();
  await expect(page.getByRole("option")).toHaveText([/GitHub/]);
});

test("items survive a reload and decrypt again", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Bank", password: "bank-secret-333", notes: "Branch 0042" });
  await page.reload();
  await unlock(page);
  await page.getByRole("option", { name: /Bank/ }).click();
  await expect(page.getByText("Branch 0042")).toBeVisible();
});

test("an edit based on an old version is refused instead of overwriting", async ({ page, context }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Netflix", password: "nf-secret-222" });

  // A second tab edits the item first.
  const other = await context.newPage();
  await other.goto("/");
  await unlock(other);
  await other.getByRole("option", { name: /Netflix/ }).click();
  await other.getByRole("button", { name: "Edit" }).click();
  await other.getByLabel("Notes").fill("Saved in the other tab");
  await other.getByRole("button", { name: "Save" }).click();
  await expect(other.getByText("Saved in the other tab")).toBeVisible();

  // This tab still has the old version.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("Saved in this tab");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("This item was changed somewhere else")).toBeVisible();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("Saved in the other tab")).toBeVisible();
});

test("trash, restore and delete forever", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Old account", password: "x" });

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await page.getByRole("option", { name: /Old account/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();

  await page.getByRole("button", { name: /^All items/ }).click();
  await page.getByRole("option", { name: /Old account/ }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await page.getByRole("option", { name: /Old account/ }).click();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
});

test("a javascript: website is shown as text, never as a link", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Trap", password: "x", url: "javascript:alert(1)" });
  await expect(page.getByText("javascript:alert(1)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open website" })).toHaveCount(0);
});

test("the password generator fills the field", async ({ page }) => {
  await registerNewAccount(page);
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Generated");
  await page.getByRole("button", { name: "Generate password" }).click();
  const output = page.locator("output");
  await expect(output).toHaveText(/^\S{20}$/);
  const generated = (await output.textContent())!.trim();
  await page.getByRole("button", { name: "Use this password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(generated);
});
