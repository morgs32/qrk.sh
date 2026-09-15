import { expect, test } from "@playwright/test";
import type { IRpcEither } from "../../scraper/types.public";

test.describe("catalog configuration requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/groups/github/profile");
    await expect(page.getByLabel("url")).toBeVisible();
    await page.evaluate(async () => {
      // Supply a whole-catalog-options form and authored fetcher. The catalogOptions decoder,
      // request lifecycle, validated store and preview remain under test.
      const groupPath = "/groupsHash.ts";
      const factoryPath = "/makeFetcherConfiguration.ts";
      const { groupsHash } = await import(groupPath);
      const { makeFetcherConfiguration } = await import(factoryPath);
      const reactPath = "/node_modules/.vite/deps/react.js";
      const { default: React } = await import(reactPath);
      const { createElement } = React;
      const content = groupsHash.github.catalogs.profile;
      const defaults = content.defaultData;
      content.configuration = makeFetcherConfiguration({
        catalogOptionsShape: {
          ...content.configuration.catalogOptionsShape,
          suffix: { ...content.configuration.catalogOptionsShape.url, defaultValue: "" },
        },
        catalogOptionsForm: ({
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
          catalogOptions,
          setData,
        }: {
          catalogOptions: { url: string; suffix: string };
          setData: (data: unknown) => void;
        }): Promise<IRpcEither<void>> => {
          document.documentElement.setAttribute(
            "data-last-catalog-options",
            JSON.stringify(catalogOptions),
          );
          document.documentElement.setAttribute(`data-request-${catalogOptions.url}`, "pending");
          await new Promise<void>((resolve) => {
            document.addEventListener(`finish:${catalogOptions.url}`, () => resolve(), {
              once: true,
            });
          });
          try {
            if (catalogOptions.url === "failure") {
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
                catalogOptions.url === "invalid" ? 42 : catalogOptions.url + catalogOptions.suffix,
            });
            return { _tag: "Right", right: undefined };
          } finally {
            document.documentElement.setAttribute(`data-request-${catalogOptions.url}`, "settled");
          }
        },
      });
    });
    // Remount through the real router so the form reads the fixture contract.
    await page.locator('a[href="/groups/github?catalog=profile"]').click();
    await expect(page.getByLabel("suffix")).toBeVisible();
    await expect(page.getByTestId("whole-catalog-options-form")).toHaveCount(1);
  });

  test("fetches on change, retains data across catalogs, and resets on reload", async ({
    page,
  }) => {
    const preview = page.locator("[data-catalog-brick]");
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
      .getByTestId("catalog-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("catalog-data-result")).toContainText("first");

    await page.getByLabel("suffix").fill("-updated");
    await expect(page.locator("html")).toHaveAttribute(
      "data-last-catalog-options",
      JSON.stringify({ url: "first", suffix: "-updated" }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("finish:first")));
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.locator('a[href="/groups/github?catalog=repo"]').click();
    await expect(page.locator("[data-catalog-brick]")).toHaveAttribute(
      "data-catalog-brick",
      "github/repo",
    );
    await page.locator('a[href="/groups/github?catalog=profile"]').click();
    await expect(preview.getByText("@first-updated")).toBeVisible();
    await page.reload();
    await expect(preview.getByText("@morgs32")).toBeVisible();
  });

  test("only the latest request can publish data or errors", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-catalog-brick]");
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
    await expect(page.getByTestId("catalog-data-error")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Getting data...");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:third")));
    await expect(preview.getByText("@third")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("retains the last valid data after provider and validation failures", async ({ page }) => {
    const input = page.getByLabel("url", { exact: true });
    const preview = page.locator("[data-catalog-brick]");
    await input.fill("valid");
    await expect(page.locator("html")).toHaveAttribute("data-request-valid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:valid")));
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("failure");
    await expect(page.locator("html")).toHaveAttribute("data-request-failure", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:failure")));
    await expect(page.getByTestId("catalog-data-error")).toContainText("profile-unavailable");
    await expect(preview.getByText("@valid")).toBeVisible();
    await input.fill("invalid");
    await expect(page.locator("html")).toHaveAttribute("data-request-invalid", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:invalid")));
    await expect(page.getByTestId("catalog-request-error")).toBeVisible();
    await expect(page.getByTestId("catalog-data-error")).toHaveCount(0);
    await expect(preview.getByText("@valid")).toBeVisible();
  });

  test("an unmounted configuration cannot overwrite the next mounted configuration", async ({
    page,
  }) => {
    await page.getByLabel("url", { exact: true }).fill("old");
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "pending");
    await page.locator('a[href="/groups/github?catalog=profile"]').click();
    await expect(page.locator('[data-catalog-brick="github/profile"]')).toBeVisible();
    await page.getByLabel("url", { exact: true }).fill("new");
    await expect(page.locator("html")).toHaveAttribute("data-request-new", "pending");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:new")));
    await page
      .getByTestId("catalog-data-result")
      .getByRole("button", { name: "expand JSON", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("catalog-data-result")).toContainText("new");
    await page.evaluate(() => document.dispatchEvent(new Event("finish:old")));
    await expect(page.locator("html")).toHaveAttribute("data-request-old", "settled");
    await expect(page.getByTestId("catalog-data-result")).toContainText("new");
    await page.locator('a[href="/groups/github?catalog=profile"]').click();
    await expect(page.locator("[data-catalog-brick]").getByText("@new")).toBeVisible();
  });
});

test("generated content options controls fetch only after Submit", async ({ page }) => {
  await page.goto("/groups/github/profile");
  await expect(page.getByLabel("URL", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const groupPath = "/groupsHash.ts";
    const factoryPath = "/makeFetcherConfiguration.ts";
    const { groupsHash } = await import(groupPath);
    const { makeFetcherConfiguration } = await import(factoryPath);
    const content = groupsHash.github.catalogs.profile;
    content.configuration = makeFetcherConfiguration({
      catalogOptionsShape: {
        ...content.configuration.catalogOptionsShape,
        url: { ...content.configuration.catalogOptionsShape.url, defaultValue: "fixture-default" },
      },
      fetcher: async ({
        catalogOptions,
        setData,
      }: {
        catalogOptions: { url: string };
        setData: (data: unknown) => void;
      }): Promise<IRpcEither<void>> => {
        document.documentElement.setAttribute("data-submitted-url", catalogOptions.url);
        setData({ ...content.defaultData, login: catalogOptions.url });
        return { _tag: "Right", right: undefined };
      },
    });
  });
  await page.locator('a[href="/groups/github?catalog=profile"]').click();
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue("fixture-default");
  await page.getByLabel("URL", { exact: true }).fill("submitted-profile");
  await expect(page.locator("html")).not.toHaveAttribute("data-submitted-url");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted-url", "submitted-profile");
  await page
    .getByTestId("catalog-data-result")
    .getByRole("button", { name: "expand JSON", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("catalog-data-result")).toContainText("submitted-profile");
});
