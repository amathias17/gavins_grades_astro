import { expect, test } from "@playwright/test";

const navigationLinks = [
  { name: "Home", href: "/" },
  { name: "Grade Room", href: "/grades" },
  { name: "Badge Room", href: "/badges" },
  { name: "Stats Room", href: "/stats" },
  { name: "Calculator", href: "/calculator" },
];

test.describe("primary room navigation", () => {
  test("shows every room destination on active pages", async ({ page }) => {
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });

    await expect(navigation).toBeVisible();
    for (const link of navigationLinks) {
      await expect(navigation.getByRole("link", { name: link.name, exact: true })).toHaveAttribute("href", link.href);
    }
  });

  test("marks the matching room active for nested routes", async ({ page }) => {
    const routes = [
      { path: "/", active: "Home" },
      { path: "/grades", active: "Grade Room" },
      { path: "/classes/0", active: "Grade Room" },
      { path: "/badges", active: "Badge Room" },
      { path: "/badges/yamcha", active: "Badge Room" },
      { path: "/stats", active: "Stats Room" },
      { path: "/calculator", active: "Calculator" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      const navigation = page.getByRole("navigation", { name: "Primary navigation" });
      await expect(navigation.getByRole("link", { name: route.active, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(navigation.locator("a[aria-current='page']")).toHaveCount(1);
    }
  });

  test("wraps compact navigation chips without mobile overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    const gradeRoom = navigation.getByRole("link", { name: "Grade Room", exact: true });

    await gradeRoom.focus();
    await expect(gradeRoom).toBeFocused();
    await expect(gradeRoom).toHaveCSS("outline-style", "solid");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
