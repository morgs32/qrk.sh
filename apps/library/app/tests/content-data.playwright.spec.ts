import { expect, test } from "@playwright/test";
import type { IRpcEither } from "../../scraper/types.public";

test.describe("catalog configuration requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/modules/github-profile");
    await expect(page.getByLabel("url")).toBeVisible();
    await page.evaluate(async () => {
      // Supply a whole-catalog-options form and authored fetcher. The moduleOptions decoder,
      // request lifecycle, validated store and preview remain under test.
      const modulePath = "/modulesHash.ts";
      const factoryPath = "/makeFetcherConfiguration.ts";
      const { modulesHash } = await import(modulePath);
      const { makeFetcherConfiguration } = await import(factoryPath);
      const reactPath = "/node_modules/.vite/deps/react.js";
      const { default: React } = await import(reactPath);
      const { createElement } = React;
      const content = modulesHash['github-profile'];
      const defaults = content.defaultData;
      content.configuration = makeFetcherConfiguration({
        moduleOptionsShape: {
          ...content.configuration.moduleOptionsShape,
          suffix: { ...content.configuration.moduleOptionsShape.url, defaultValue: "" },
        },
        moduleOptionsForm: ({
          value,
          onChange,
        }: {
          value: { url: string; suffix: string };
          onChange: (value: { url: string; suffix: string }) => void;
        }) =>
          createElement(
            "div",
            { "data-testid": "whole-catalog-options-form" },
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
          moduleOptions,
          setData,
        }: {
          moduleOptions: { url: string; suffix: string };
          setData: (data: unknown) => void;
        }): Promise<IRpcEither<void>> => {
          document.documentElement.setAttribute(
            "data-last-catalog-options",
            JSON.stringify(moduleOptions),
          );
          document.documentElement.setAttribute(`data-request-${moduleOptions.url}`, "pending");
          await new Promise<void>((resolve) => {
            document.addEventListener(`finish:${moduleOptions.url}`, () => resolve(), {
              once: true,
            });
          });
          try {
            if (moduleOptions.url === "failure") {
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
                moduleOptions.url === "invalid" ? 42 : moduleOptions.url + moduleOptions.suffix,
            });
            return { _tag: "Right", right: undefined };
          } finally {
            document.documentElement.setAttribute(`data-request-${moduleOptions.url}`, "settled");
          }
        },
      });
    });
    // Remount through the real router so the form reads the fixture contract.
    await page.locator('a[href="/modules/github-profile"]').click();
    await expect(page.getByLabel("suffix")).toBeVisible();
    await expect(page.getByTestId("whole-catalog-options-form")).toHaveCount(1);
  });

  test("fetches on change, retains data across catalogs, and resets on reload", async ({
    page,
  }) => {
    const preview = page.locator("[data-module-brick]");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-last-catalog-options");
    await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

    await page.getByLabel("url", { exact: true }).fill("first");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-catalog-options",
      JSON.stringify({ url: "first", suffix: "" }),
    );
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first")).toBeVisible();
    await page
      .getByTestId("module-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("module-data-result")).toContainText("first");

    await page.getByLabel("suffix").fill("-updated");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-catalog-options",
      JSON.stringify({ url: "first", suffix: "-updated" }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.locator('a[href="/modules/github-repo"]').click();
    await expect(page.locator("[data-module-brick]")).toHaveAttribute(
      "data-module-brick",
      "github/repo",
    );
    await page.locator('a[href="/modules/github-profile"]').click();
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.reload();
    await expect(preview.getByText("@morgs32")).toBeVisible();
  });

  test("only the latest request can publish data or errors", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-module-brick]");
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
    await expect(page.getByTestId("module-data-error")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:third")));
    await expect(preview.getByText("@third")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("retains the last valid data after provider and validation failures", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-module-brick]");
    await input.fill("valid");
    await expect(page.locator("html")).toHaveAttribute("data-request-valid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:valid")));
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.getByTestId("module-data-error")).toContainText("profile-unavailable");
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("invalid");
    await expect(page.locator("html")).toHaveAttribute("data-request-invalid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:invalid")));
    await expect(page.getByTestId("module-request-error")).toBeVisible();
    await expect(page.getByTestId("module-data-error")).toHaveCount(0);
    await expect(preview.getByText("@valid")).toBeVisible();
  });

  test("an unmounted configuration cannot overwrite the next mounted configuration", async ({
    page,
  }) => {
    await page.getByLabel("url", { exact: true }).fill("old");
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "pending");
    await page.locator('a[href="/modules/github-profile"]').click();
    await expect(page.locator('[data-module-brick="github/profile"]')).toBeVisible();
    await page.getByLabel("url", { exact: true }).fill("new");
    await expect(page.locator("html")).toHaveAttribute("data-request-new", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:new")));
    await page
      .getByTestId("module-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("module-data-result")).toContainText("new");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:old")));
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "settled");
    await expect(page.getByTestId("module-data-result")).toContainText("new");
    await page.locator('a[href="/modules/github-profile"]').click();
    await expect(page.locator("[data-module-brick]").getByText("@new")).toBeVisible();
  });
});

test("generated content options controls fetch only after Submit", async ({ page }) => {
  await page.goto("/modules/github-profile");
  await expect(page.getByLabel("URL", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/modulesHash.ts";
    const factoryPath = "/makeFetcherConfiguration.ts";
    const { modulesHash } = await import(modulePath);
    const { makeFetcherConfiguration } = await import(factoryPath);
    const content = modulesHash['github-profile'];
    content.configuration = makeFetcherConfiguration({
      moduleOptionsShape: {
        ...content.configuration.moduleOptionsShape,
        url: { ...content.configuration.moduleOptionsShape.url, defaultValue: "fixture-default" },
      },
      fetcher: async ({
        moduleOptions,
        setData,
      }: {
        moduleOptions: { url: string };
        setData: (data: unknown) => void;
      }): Promise<IRpcEither<void>> => {
        document.documentElement.setAttribute("data-submitted-url", moduleOptions.url);
        setData({ ...content.defaultData, login: moduleOptions.url });
        return { _tag: "Right", right: undefined };
      },
    });
  });
  await page.locator('a[href="/modules/github-profile"]').click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue("fixture-default");
  await page.getByLabel("URL", { exact: true }).fill("submitted-profile");
  await expect(page.locator("html")).not.toHaveAttribute("data-submitted-url");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted-url", "submitted-profile");
  await page
    .getByTestId("module-data-result")
    .getByRole("button", { name: "expand JSON", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("module-data-result")).toContainText("submitted-profile");
});
