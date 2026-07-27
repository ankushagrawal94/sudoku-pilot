import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__SUDOKU_ACCOUNT_CONFIG__ = {
      enabled: true,
      authUrl: "https://auth.account.test",
      dataApiUrl: "https://data.account.test",
      timeoutMs: 500
    };
  });
  await page.route("https://auth.account.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null, session: null })
    });
  });
  await page.route("https://data.account.test/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
});

test("optional account surface preserves guest play and works at 320px", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/?view=play&panel=more");

  const account = page.getByTestId("account-panel");
  await expect(account.getByRole("heading", { name: "Play on every device" })).toBeVisible();
  await expect(account).toContainText("Optional. Sudoku Pilot still works without an account.");

  await account.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByTestId("account-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(dialog.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
  await expect(dialog.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(dialog.getByRole("button", { name: "Close account dialog" })).toBeFocused();

  await context.setOffline(true);
  await dialog.getByLabel("Email").fill("pilot@example.test");
  await dialog.getByLabel("Password").fill("not-a-real-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Connect to the internet to sign in.");
  await context.setOffline(false);

  await dialog.getByRole("button", { name: "Close account dialog" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-cell]")).toHaveCount(81);
});
