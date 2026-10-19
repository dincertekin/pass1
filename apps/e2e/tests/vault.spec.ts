import { addItem, expect, openSettings, registerNewAccount, test, unlock } from "./fixtures";

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
  await page.getByRole("button", { name: /Add a login/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Generated");
  await page.getByRole("button", { name: "Generate password" }).click();
  const output = page.locator("output");
  await expect(output).toHaveText(/^\S{20}$/);
  const generated = (await output.textContent())!.trim();
  await page.getByRole("button", { name: "Use this password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(generated);
});

test("a new account sees the first-run screen, and it leads to import and adding items", async ({ page }) => {
  await registerNewAccount(page);
  await expect(page.getByText("1 of 4 done")).toBeVisible();

  // People tick off the steps pass1 can't check itself.
  await page.getByText("Store your master password somewhere safe offline").click();
  await expect(page.getByText("2 of 4 done")).toBeVisible();

  await page.getByRole("button", { name: /Import passwords/ }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByRole("heading", { name: "Import & export" })).toBeVisible();
  await page.keyboard.press("Escape");

  await addItem(page, { name: "Gmail", password: "first-item-pass" });
  await expect(page.getByRole("heading", { name: /Welcome to pass1/ })).toHaveCount(0);
});

test("password health finds reused and weak passwords", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "Gmail", password: "orbit-lantern-quiet-47-shared" });
  await addItem(page, { name: "Figma", password: "orbit-lantern-quiet-47-shared" });
  await addItem(page, { name: "Netflix", password: "summer2021" });
  await addItem(page, { name: "Bank", password: "Xp4$wN7!rQ2zL9m#kV" });

  await page.getByRole("button", { name: /^Password health/ }).click();
  await expect(page.getByRole("option")).toHaveText([/Figma.*Reused/, /Gmail.*Reused/, /Netflix.*Weak/]);

  await page.getByRole("option", { name: /Gmail/ }).click();
  await expect(page.getByText("This password is also used for Figma.")).toBeVisible();
  await page.getByRole("option", { name: /Netflix/ }).click();
  await expect(page.getByText("This password is easy to guess.")).toBeVisible();

  // Fixing it removes the item from the list.
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Password", { exact: true }).fill("velvet-canyon-drift-seventeen-owl");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: /^Password health/ }).click();
  await expect(page.getByRole("option")).toHaveCount(2);
});

test("import from a Chrome CSV export", async ({ page }) => {
  await registerNewAccount(page);
  const dialog = await openSettings(page, "Import & export");
  await dialog.getByRole("button", { name: /Chrome, Edge or Safari/ }).click();

  const csv = "name,url,username,password,note\ngithub.com,https://github.com,ada-dev,gh-secret-111,\nnetflix.com,https://netflix.com,ada@example.com,nf-secret-222,Family\n";
  await expect(dialog.getByRole("heading", { name: /Import from Chrome/ })).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "Chrome Passwords.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByText(/Found\s+2\s+items/)).toBeVisible();
  await dialog.getByRole("button", { name: "Import 2 items" }).click();
  await expect(dialog.getByText(/Imported 2 items\. Now delete the file/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("Escape");

  // Imported items show up straight away, without a reload.
  await expect(page.getByRole("option")).toHaveText([/github\.com/, /netflix\.com/]);
});

test("appearance and density settings apply at once and are remembered", async ({ page }) => {
  await registerNewAccount(page);
  const dialog = await openSettings(page, "General");
  await dialog.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await unlock(page);
  const again = await openSettings(page, "General");
  await again.getByRole("button", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});

test("the item list can be resized by dragging, with the keyboard, and reset by double-click", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "GitHub", password: "Xp4$wN7!rQ2zL9m#kV" });
  const list = page.getByRole("region", { name: "Items" });
  const divider = page.getByRole("separator", { name: "Resize the item list" });
  expect(Math.round((await list.boundingBox())!.width)).toBe(340);

  // Drag 120px to the right.
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + 200, { steps: 6 });
  await page.mouse.up();
  expect(Math.round((await list.boundingBox())!.width)).toBe(460);

  // Remembered after a reload.
  await page.reload();
  await unlock(page);
  await expect(page.getByRole("option", { name: /GitHub/ })).toBeVisible();
  expect(Math.round((await list.boundingBox())!.width)).toBe(460);

  // Keyboard: Home goes to the narrowest, arrows step by 16px.
  await divider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  expect(Math.round((await list.boundingBox())!.width)).toBe(276);
  await expect(divider).toHaveAttribute("aria-valuenow", "276");

  await divider.dblclick();
  expect(Math.round((await list.boundingBox())!.width)).toBe(340);
});

test("the item details always keep room, however far the list is dragged", async ({ page }) => {
  await registerNewAccount(page);
  await addItem(page, { name: "GitHub", password: "Xp4$wN7!rQ2zL9m#kV" });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.getByRole("separator", { name: "Resize the item list" }).focus();
  await page.keyboard.press("End");
  const detail = (await page.locator("article").boundingBox())!;
  expect(detail.width).toBeGreaterThanOrEqual(420);
});
