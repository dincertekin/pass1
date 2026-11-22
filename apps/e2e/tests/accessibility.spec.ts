import { accessibilityProblems } from "./accessibility";
import { addItem, expect, lockVault, openSettings, openSignupLink, registerNewAccount, requestSignupEmail, test } from "./fixtures";

// Every main screen, checked with axe in light and in dark mode: color contrast differs between them.

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`In ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("logging in and signing up are accessible", async ({ page }) => {
      await page.goto("/login");
      expect(await accessibilityProblems(page), "log in").toEqual([]);

      await page.goto("/register");
      expect(await accessibilityProblems(page), "sign up").toEqual([]);

      await requestSignupEmail(page, `a11y-${crypto.randomUUID()}@example.com`);
      expect(await accessibilityProblems(page), "check your inbox").toEqual([]);

      await openSignupLink(page);
      expect(await accessibilityProblems(page), "choose a master password").toEqual([]);
    });

    test("the vault, an item, the editor, Settings and the unlock screen are accessible", async ({ page }) => {
      await registerNewAccount(page);
      expect(await accessibilityProblems(page), "empty vault").toEqual([]);

      await addItem(page, { name: "GitHub", username: "ada-dev", password: "gh-secret-111", url: "github.com", notes: "Work account" });
      expect(await accessibilityProblems(page), "vault with an item open").toEqual([]);

      await page.getByRole("button", { name: "Edit" }).click();
      expect(await accessibilityProblems(page), "item editor").toEqual([]);
      await page.getByRole("button", { name: "Cancel" }).click();

      await openSettings(page);
      expect(await accessibilityProblems(page), "Settings").toEqual([]);
      await page.keyboard.press("Escape");

      await lockVault(page);
      expect(await accessibilityProblems(page), "unlock").toEqual([]);
    });

    test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test("the vault is accessible", async ({ page }) => {
        await registerNewAccount(page);
        await addItem(page, { name: "Netflix", password: "summer2021" });
        expect(await accessibilityProblems(page), "item on a phone").toEqual([]);
        await page.getByRole("button", { name: "Back" }).click();
        expect(await accessibilityProblems(page), "list on a phone").toEqual([]);
      });
    });
  });
}
