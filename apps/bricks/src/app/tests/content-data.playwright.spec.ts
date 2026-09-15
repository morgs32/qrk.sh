import { expect, test } from "@playwright/test";
import type { IRpcEither } from "../../scraper/types.public";

test.describe("registry configuration requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/catalogs/github/profile");
    await expect(page.getByLabel("url")).toBeVisible();
    await page.evaluate(async () => {
      // Supply a whole-registry-options form and authored fetcher. The registryOptions decoder,
      // request lifecycle, validated store and preview remain under test.
      const catalogPath = "/src/catalogsHash.ts";
      const factoryPath = "/src/makeFetcherConfiguration.ts";
      const { catalogsHash } = await import(catalogPath);
      const { makeFetcherConfiguration } = await import(factoryPath);
      const reactPath = "/node_modules/.vite/deps/react.js";
      const { default: React } = await import(reactPath);
      const { createElement } = React;
      const content = catalogsHash.github.registries.profile;
      const defaults = content.defaultData;
      content.configuration = makeFetcherConfiguration({
        registryOptionsShape: {
          ...content.configuration.registryOptionsShape,
          suffix: { ...content.configuration.registryOptionsShape.url, defaultValue: "" },
        },
        registryOptionsForm: ({
          value,
          onChange,
        }: {
          value: { url: string; suffix: string };
          onChange: (value: { url: string; suffix: string }) => void;
        }) =>
          createElement(
            "div",
            { "data-testid": "whole-registry-options-form" },
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
          registryOptions,
          setData,
        }: {
          registryOptions: { url: string; suffix: string };
          setData: (data: unknown) => void;
        }): Promise<IRpcEither<void>> => {
          document.documentElement.setAttribute(
            "data-last-registry-options",
            JSON.stringify(registryOptions),
          );
          document.documentElement.setAttribute(`data-request-${registryOptions.url}`, "pending");
          await new Promise<void>((resolve) => {
            document.addEventListener(`finish:${registryOptions.url}`, () => resolve(), {
              once: true,
            });
          });
          try {
            if (registryOptions.url === "failure") {
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
                registryOptions.url === "invalid" ? 42 : registryOptions.url + registryOptions.suffix,
            });
            return { _tag: "Right", right: undefined };
          } finally {
            document.documentElement.setAttribute(`data-request-${registryOptions.url}`, "settled");
          }
        },
      });
    });
    // Remount through the real router so the form reads the fixture contract.
    await page.locator('a[href="/catalogs/github?registry=profile"]').click();
    await expect(page.getByLabel("suffix")).toBeVisible();
    await expect(page.getByTestId("whole-registry-options-form")).toHaveCount(1);
  });

  test("fetches on change, retains data across registries, and resets on reload", async ({
    page,
  }) => {
    const preview = page.locator("[data-registry-brick]");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-last-registry-options");
    await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

    await page.getByLabel("url", { exact: true }).fill("first");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-registry-options",
      JSON.stringify({ url: "first", suffix: "" }),
    );
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await expect(preview.getByText("@morgs32")).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first")).toBeVisible();
    await page
      .getByTestId("registry-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("registry-data-result")).toContainText("first");

    await page.getByLabel("suffix").fill("-updated");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-registry-options",
      JSON.stringify({ url: "first", suffix: "-updated" }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.locator('a[href="/catalogs/github?registry=repo"]').click();
    await expect(page.locator("[data-registry-brick]")).toHaveAttribute("data-registry-brick", "github/repo");
    await page.locator('a[href="/catalogs/github?registry=profile"]').click();
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.reload();
    await expect(preview.getByText("@morgs32")).toBeVisible();
  });

  test("only the latest request can publish data or errors", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-registry-brick]");
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
    await expect(page.getByTestId("registry-data-error")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:third")));
    await expect(preview.getByText("@third")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("retains the last valid data after provider and validation failures", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-registry-brick]");
    await input.fill("valid");
    await expect(page.locator("html")).toHaveAttribute("data-request-valid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:valid")));
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.getByTestId("registry-data-error")).toContainText("profile-unavailable");
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("invalid");
    await expect(page.locator("html")).toHaveAttribute("data-request-invalid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:invalid")));
    await expect(page.getByTestId("registry-request-error")).toBeVisible();
    await expect(page.getByTestId("registry-data-error")).toHaveCount(0);
    await expect(preview.getByText("@valid")).toBeVisible();
  });

  test("an unmounted configuration cannot overwrite the next mounted configuration", async ({
    page,
  }) => {
    await page.getByLabel("url", { exact: true }).fill("old");
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "pending");
    await page.locator('a[href="/catalogs/github?registry=profile"]').click();
    await expect(page.locator('[data-registry-brick="github/profile"]')).toBeVisible();
    await page.getByLabel("url", { exact: true }).fill("new");
    await expect(page.locator("html")).toHaveAttribute("data-request-new", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:new")));
    await page
      .getByTestId("registry-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("registry-data-result")).toContainText("new");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:old")));
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "settled");
    await expect(page.getByTestId("registry-data-result")).toContainText("new");
    await page.locator('a[href="/catalogs/github?registry=profile"]').click();
    await expect(page.locator("[data-registry-brick]").getByText("@new")).toBeVisible();
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
    const content = catalogsHash.github.registries.profile;
    content.configuration = makeFetcherConfiguration({
      registryOptionsShape: {
        ...content.configuration.registryOptionsShape,
        url: { ...content.configuration.registryOptionsShape.url, defaultValue: "fixture-default" },
      },
      fetcher: async ({
        registryOptions,
        setData,
      }: {
        registryOptions: { url: string };
        setData: (data: unknown) => void;
      }): Promise<IRpcEither<void>> => {
        document.documentElement.setAttribute("data-submitted-url", registryOptions.url);
        setData({ ...content.defaultData, login: registryOptions.url });
        return { _tag: "Right", right: undefined };
      },
    });
  });
  await page.locator('a[href="/catalogs/github?registry=profile"]').click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue("fixture-default");
  await page.getByLabel("URL", { exact: true }).fill("submitted-profile");
  await expect(page.locator("html")).not.toHaveAttribute("data-submitted-url");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted-url", "submitted-profile");
  await page
    .getByTestId("registry-data-result")
    .getByRole("button", { name: "expand JSON", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("registry-data-result")).toContainText("submitted-profile");
});
