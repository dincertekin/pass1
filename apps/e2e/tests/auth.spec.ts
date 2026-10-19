import { expect, logIn, logOut, registerNewAccount, test, unlock } from "./fixtures";

const WELCOME = "Welcome to pass1. Let's fill your vault.";

test("a new account starts unlocked, and a reload locks it", async ({ page }) => {
  await registerNewAccount(page);
  await page.reload();
  await expect(page).toHaveURL(/\/unlock$/);

  await unlock(page, "not my password");
  await expect(page.getByText("Master password is incorrect.")).toBeVisible();

  await unlock(page);
  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
});

test("log out, then log back in", async ({ page }) => {
  const email = await registerNewAccount(page);
  await logOut(page);

  // The email is case-insensitive.
  await logIn(page, email.toUpperCase(), "wrong password");
  await expect(page.getByText("Email or master password is incorrect.")).toBeVisible();

  await logIn(page, email);
  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
});

test("a weak master password can't be used", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Master password", { exact: true }).fill("password1");
  await page.getByLabel("Confirm master password").fill("password1");
  await page.getByRole("checkbox").check();
  await expect(page.getByText(/Very weak|Weak/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
});

test("nothing about the session is readable by JavaScript or left in storage", async ({ page }) => {
  await registerNewAccount(page);
  const stored = await page.evaluate(() => ({
    cookie: document.cookie,
    local: Object.keys(localStorage).filter((key) => key !== "pass1.settings"),
    session: Object.keys(sessionStorage),
  }));
  expect(stored).toEqual({ cookie: "", local: [], session: [] });
});
