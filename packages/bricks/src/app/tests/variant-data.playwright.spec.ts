import { expect, test } from "@playwright/test";
import type { IRpcEither } from "../../scraper/types.public";

test.describe("variant configuration requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collections/github/profile");
    await expect(page.getByLabel("url")).toBeVisible();
    await page.evaluate(async () => {
      // Replace only the authored fetcher. The real form, payload decoder,
      // request lifecycle, validated store and preview remain under test.
      const catalogPath = "/src/collectionsHash.ts";
      const factoryPath = "/src/makeFetcherConfiguration.ts";
      const { collectionsHash } = await import(catalogPath);
      const { makeFetcherConfiguration } = await import(factoryPath);
      const variant = collectionsHash.github.variants.profile;
      const defaults = variant.defaultData;
      variant.configuration = makeFetcherConfiguration({
        payloadShape: {
          ...variant.configuration.payloadShape,
          suffix: { ...variant.configuration.payloadShape.url, defaultValue: "" },
        },
        fetcher: async ({
          payload,
          setData,
        }: {
          payload: { url: string; suffix: string };
          setData: (data: unknown) => void;
        }): Promise<IRpcEither<void>> => {
          document.documentElement.setAttribute("data-last-payload", JSON.stringify(payload));
          document.documentElement.setAttribute(`data-request-${payload.url}`, "pending");
          await new Promise<void>((resolve) => {
            document.addEventListener(`finish:${payload.url}`, () => resolve(), { once: true });
          });
          try {
            if (payload.url === "failure") {
              return {
                _tag: "Left",
                left: {
                  code: "profile-unavailable",
                  message: "Profile unavailable",
                },
              };
            }
            setData({
              ...defaults,
              login: payload.url === "invalid" ? 42 : payload.url + payload.suffix,
            });
            return { _tag: "Right", right: undefined };
          } finally {
            document.documentElement.setAttribute(`data-request-${payload.url}`, "settled");
          }
        },
      });
    });
    // Remount through the real router so the form reads the fixture contract.
    await page.locator('a[href="/collections/github?variant=profile&layout=4x4"]').click();
    await expect(page.getByLabel("suffix")).toBeVisible();
  });

  test("fetches on change, retains data across layouts and variants, and resets on reload", async ({
    page,
  }) => {
    const preview = page.locator("[data-variant-layout-brick]");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-last-payload");
    await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

    await page.getByLabel("url", { exact: true }).fill("first");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-payload",
      JSON.stringify({ url: "first", suffix: "" }),
    );
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first")).toBeVisible();
    await expect(page.getByTestId("variant-data-result")).toContainText("first");

    await page.getByLabel("suffix").fill("-updated");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-payload",
      JSON.stringify({ url: "first", suffix: "-updated" }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.locator('a[href="/collections/github?variant=profile&layout=4x2"]').click();
    await expect(page.locator('[data-variant-layout-brick="github/profile/4x2"]')).toBeVisible();
    await expect(page.getByTestId("variant-data-result")).toContainText("first-updated");
    await page.locator('a[href="/collections/github?variant=repo"]').click();
    await expect(page.getByTestId("variant-data-result")).toHaveCount(0);
    await page.locator('a[href="/collections/github?variant=profile&layout=4x4"]').click();
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.reload();
    await expect(preview.getByText("@morgs32")).toBeVisible();
  });

  test("only the latest request can publish data or errors", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-variant-layout-brick]");
    await input.fill("first");
    await expect(page.locator("html")).toHaveAttribute("data-request-first", "pending");
    await input.fill("second");
    await expect(page.locator("html")).toHaveAttribute("data-request-second", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:second")));
    await expect(preview.getByText("@second")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(page.locator("html")).toHaveAttribute("data-request-first", "settled");
    await expect(preview.getByText("@second")).toBeVisible();

    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await input.fill("third");
    await expect(page.locator("html")).toHaveAttribute("data-request-third", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "settled");
    await expect(page.getByTestId("variant-data-error")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:third")));
    await expect(preview.getByText("@third")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("retains the last valid data after provider and validation failures", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-variant-layout-brick]");
    await input.fill("valid");
    await expect(page.locator("html")).toHaveAttribute("data-request-valid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:valid")));
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.getByTestId("variant-data-error")).toContainText("profile-unavailable");
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("invalid");
    await expect(page.locator("html")).toHaveAttribute("data-request-invalid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:invalid")));
    await expect(page.getByTestId("variant-request-error")).toBeVisible();
    await expect(page.getByTestId("variant-data-error")).toHaveCount(0);
    await expect(preview.getByText("@valid")).toBeVisible();
  });

  test("an unmounted configuration cannot overwrite the next mounted configuration", async ({
    page,
  }) => {
    await page.getByLabel("url", { exact: true }).fill("old");
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "pending");
    await page.locator('a[href="/collections/github?variant=profile&layout=4x2"]').click();
    await expect(page.locator('[data-variant-layout-brick="github/profile/4x2"]')).toBeVisible();
    await page.getByLabel("url", { exact: true }).fill("new");
    await expect(page.locator("html")).toHaveAttribute("data-request-new", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:new")));
    await expect(page.getByTestId("variant-data-result")).toContainText("new");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:old")));
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "settled");
    await expect(page.getByTestId("variant-data-result")).toContainText("new");
    await page.locator('a[href="/collections/github?variant=profile&layout=4x4"]').click();
    await expect(page.locator("[data-variant-layout-brick]").getByText("@new")).toBeVisible();
  });
});
