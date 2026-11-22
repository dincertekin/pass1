import { expect, logIn, logOut, MASTER_PASSWORD, openSignupLink, registerNewAccount, requestSignupEmail, test, unlock } from "./fixtures";
import { waitForEmailTo } from "./mailpit";

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
  await openSignupLink(page);
  await page.getByLabel("Master password", { exact: true }).fill("password1");
  await page.getByLabel("Confirm master password").fill("password1");
  await page.getByRole("checkbox").check();
  await expect(page.getByText(/Very weak|Weak/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
});

test("signing up with an email that has an account looks the same, and the email says so", async ({ page }) => {
  const email = await registerNewAccount(page);
  await logOut(page);
  await requestSignupEmail(page, email);
  const second = await waitForEmailTo(email, 2);
  expect(second.subject).toBe("You already have a pass1 account");
  expect(second.text).not.toContain("#token=");
});

test("the sign-up link leaves the address bar once opened, and works only once", async ({ page }) => {
  const { link } = await openSignupLink(page);
  expect(page.url()).not.toContain("#");

  await page.getByLabel("Master password", { exact: true }).fill(MASTER_PASSWORD);
  await page.getByLabel("Confirm master password").fill(MASTER_PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to pass1. Let's fill your vault." })).toBeVisible();
  await logOut(page);

  await page.goto(link);
  await expect(page.getByText("This sign-up link has expired or was already used.")).toBeVisible();
  await page.getByRole("link", { name: "Start again" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
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
