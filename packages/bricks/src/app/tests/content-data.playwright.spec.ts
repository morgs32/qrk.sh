import { expect, test } from "@playwright/test";
import type { IRpcEither } from "../../scraper/types.public";

test.describe("content configuration requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/catalogs/github/profile");
    await expect(page.getByLabel("url")).toBeVisible();
    await page.evaluate(async () => {
      // Supply a whole-content-options form and authored fetcher. The contentOptions decoder,
      // request lifecycle, validated store and preview remain under test.
      const catalogPath = "/src/catalogsHash.ts";
      const factoryPath = "/src/makeFetcherConfiguration.ts";
      const { catalogsHash } = await import(catalogPath);
      const { makeFetcherConfiguration } = await import(factoryPath);
      const reactPath = "/node_modules/.vite/deps/react.js";
      const { default: React } = await import(reactPath);
      const { createElement } = React;
      const content = catalogsHash.github.contents.profile;
      const defaults = content.defaultData;
      content.configuration = makeFetcherConfiguration({
        contentOptionsShape: {
          ...content.configuration.contentOptionsShape,
          suffix: { ...content.configuration.contentOptionsShape.url, defaultValue: "" },
        },
        contentOptionsForm: ({
          value,
          onChange,
        }: {
          value: { url: string; suffix: string };
          onChange: (value: { url: string; suffix: string }) => void;
        }) =>
          createElement(
            "div",
            { "data-testid": "whole-content-options-form" },
            createElement("input", {
              "aria-label": "url",
              value: value.url,
              onChange: (event: { target: { value: string } }) =>
                onChange({ ...value, url: event.target.value }),
            }),
            createElement("input", {
              "aria-label": "suffix",
              value: value.suffix,
              onChange: (event: { target: { value: string } }) =>
                onChange({ ...value, suffix: event.target.value }),
            }),
          ),
        fetcher: async ({
          contentOptions,
          setData,
        }: {
          contentOptions: { url: string; suffix: string };
          setData: (data: unknown) => void;
        }): Promise<IRpcEither<void>> => {
          document.documentElement.setAttribute(
            "data-last-content-options",
            JSON.stringify(contentOptions),
          );
          document.documentElement.setAttribute(`data-request-${contentOptions.url}`, "pending");
          await new Promise<void>((resolve) => {
            document.addEventListener(`finish:${contentOptions.url}`, () => resolve(), {
              once: true,
            });
          });
          try {
            if (contentOptions.url === "failure") {
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
              login:
                contentOptions.url === "invalid" ? 42 : contentOptions.url + contentOptions.suffix,
            });
            return { _tag: "Right", right: undefined };
          } finally {
            document.documentElement.setAttribute(`data-request-${contentOptions.url}`, "settled");
          }
        },
      });
    });
    // Remount through the real router so the form reads the fixture contract.
    await page.locator('a[href="/catalogs/github?content=profile&view=4x4"]').click();
    await expect(page.getByLabel("suffix")).toBeVisible();
    await expect(page.getByTestId("whole-content-options-form")).toHaveCount(1);
  });

  test("fetches on change, retains data across views and contents, and resets on reload", async ({
    page,
  }) => {
    const preview = page.locator("[data-content-view-brick]");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-last-content-options");
    await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

    await page.getByLabel("url", { exact: true }).fill("first");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-content-options",
      JSON.stringify({ url: "first", suffix: "" }),
    );
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first")).toBeVisible();
    await page
      .getByTestId("content-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("content-data-result")).toContainText("first");

    await page.getByLabel("suffix").fill("-updated");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-content-options",
      JSON.stringify({ url: "first", suffix: "-updated" }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.locator('a[href="/catalogs/github?content=profile&view=4x2"]').click();
    await expect(page.locator('[data-content-view-brick="github/profile/4x2"]')).toBeVisible();
    await page
      .getByTestId("content-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("content-data-result")).toContainText("first-updated");
    await page.locator('a[href="/catalogs/github?content=repo"]').click();
    await expect(page.getByTestId("content-data-result")).toHaveCount(0);
    await page.locator('a[href="/catalogs/github?content=profile&view=4x4"]').click();
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.reload();
    await expect(preview.getByText("@morgs32")).toBeVisible();
  });

  test("only the latest request can publish data or errors", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-content-view-brick]");
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
    await expect(page.getByTestId("content-data-error")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:third")));
    await expect(preview.getByText("@third")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("retains the last valid data after provider and validation failures", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-content-view-brick]");
    await input.fill("valid");
    await expect(page.locator("html")).toHaveAttribute("data-request-valid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:valid")));
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.getByTestId("content-data-error")).toContainText("profile-unavailable");
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("invalid");
    await expect(page.locator("html")).toHaveAttribute("data-request-invalid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:invalid")));
    await expect(page.getByTestId("content-request-error")).toBeVisible();
    await expect(page.getByTestId("content-data-error")).toHaveCount(0);
    await expect(preview.getByText("@valid")).toBeVisible();
  });

  test("an unmounted configuration cannot overwrite the next mounted configuration", async ({
    page,
  }) => {
    await page.getByLabel("url", { exact: true }).fill("old");
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "pending");
    await page.locator('a[href="/catalogs/github?content=profile&view=4x2"]').click();
    await expect(page.locator('[data-content-view-brick="github/profile/4x2"]')).toBeVisible();
    await page.getByLabel("url", { exact: true }).fill("new");
    await expect(page.locator("html")).toHaveAttribute("data-request-new", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:new")));
    await page
      .getByTestId("content-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("content-data-result")).toContainText("new");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:old")));
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "settled");
    await expect(page.getByTestId("content-data-result")).toContainText("new");
    await page.locator('a[href="/catalogs/github?content=profile&view=4x4"]').click();
    await expect(page.locator("[data-content-view-brick]").getByText("@new")).toBeVisible();
  });
});

test("generated content options controls fetch only after Submit", async ({ page }) => {
  await page.goto("/catalogs/github/profile");
  await expect(page.getByLabel("URL", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const catalogPath = "/src/catalogsHash.ts";
    const factoryPath = "/src/makeFetcherConfiguration.ts";
    const { catalogsHash } = await import(catalogPath);
    const { makeFetcherConfiguration } = await import(factoryPath);
    const content = catalogsHash.github.contents.profile;
    content.configuration = makeFetcherConfiguration({
      contentOptionsShape: {
        ...content.configuration.contentOptionsShape,
        url: { ...content.configuration.contentOptionsShape.url, defaultValue: "fixture-default" },
      },
      fetcher: async ({
        contentOptions,
        setData,
      }: {
        contentOptions: { url: string };
        setData: (data: unknown) => void;
      }): Promise<IRpcEither<void>> => {
        document.documentElement.setAttribute("data-submitted-url", contentOptions.url);
        setData({ ...content.defaultData, login: contentOptions.url });
        return { _tag: "Right", right: undefined };
      },
    });
  });
  await page.locator('a[href="/catalogs/github?content=profile&view=4x4"]').click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue("fixture-default");
  await page.getByLabel("URL", { exact: true }).fill("submitted-profile");
  await expect(page.locator("html")).not.toHaveAttribute("data-submitted-url");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted-url", "submitted-profile");
  await page
    .getByTestId("content-data-result")
    .getByRole("button", { name: "expand JSON", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("content-data-result")).toContainText("submitted-profile");
});
