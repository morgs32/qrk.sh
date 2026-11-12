import { Button } from "@qrk.sh/bricks/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qrk.sh/bricks/components/tabs";
import { candidateLibrary } from "@qrk.sh/bricks/modules/candidateLibrary";
import { categories } from "@qrk.sh/bricks/modules/react/categories";
import { Carousel } from "motion-plus/react";
import { useCallback, useState } from "react";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";
import { ModuleConfiguration } from "./ModuleConfiguration";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
}) {
  const { breakpoint, cardStyle } = props;
  const [selected, setSelected] = useState<{
    moduleId: keyof typeof modulesHash;
    layoutId: string;
    state: unknown;
  } | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const modules = Object.values(modulesHash);
  const visibleCategories = categories.filter((category) =>
    modules.some((brickModule) => brickModule.categoryIds.includes(category.id)),
  );
  const rows = [
    {
      label: "GitHub",
      items: [
        {
          brickModule: modulesHash["github-activity"],
          layoutId: "default",
          label: "GitHub Activity",
        },
        {
          brickModule: modulesHash["github-profile"],
          layoutId: "default",
          label: "GitHub Profile",
        },
        { brickModule: modulesHash["github-repo"], layoutId: "default", label: "GitHub Repo" },
      ],
    },
    {
      label: "Images",
      items: [
        { brickModule: modulesHash.image, layoutId: "captionless", label: "Image" },
        {
          brickModule: modulesHash.image,
          layoutId: "captionless",
          previewId: "round",
          label: "Round Image",
        },
        { brickModule: modulesHash.image, layoutId: "captioned", label: "Image with caption" },
        {
          brickModule: modulesHash["image-carousel"],
          layoutId: "default",
          label: "Image Carousel",
        },
      ],
    },
    ...modules
      .filter(
        (brickModule) =>
          !["github-activity", "github-profile", "github-repo", "image", "image-carousel"].includes(
            brickModule.id,
          ),
      )
      .map((brickModule) => ({
        label: brickModule.label,
        items: [{ brickModule, layoutId: "default", label: brickModule.label }],
      })),
  ];
  if (selected !== null) {
    return (
      <ModuleConfiguration
        key={`${selected.moduleId}:${selected.layoutId}`}
        moduleId={selected.moduleId}
        layoutId={selected.layoutId}
        initialState={selected.state}
        breakpoint={breakpoint}
        cardStyle={cardStyle}
        onClose={close}
      />
    );
  }

  return (
    <Tabs defaultValue="all" className="h-full min-h-0 w-full min-w-0 gap-0">
      <TabsList
        variant="line"
        size="sm"
        activateOnFocus
        aria-label="Brick categories"
        className="shrink-0 px-3 font-sans"
      >
        <TabsTrigger value="all" render={<Button type="button" variant="ghost" />}>
          All
        </TabsTrigger>
        {visibleCategories.map((category) => (
          <TabsTrigger
            key={category.id}
            value={category.id}
            render={<Button type="button" variant="ghost" />}
          >
            {category.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div
        aria-label="Brick modules"
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
      >
        {[{ id: "all" }, ...visibleCategories].map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-0">
            {rows.map((row) => {
              const items = row.items.filter(
                (item) =>
                  category.id === "all" ||
                  item.brickModule.categoryIds.some((id) => id === category.id),
              );
              if (items.length === 0) return null;
              return (
                <section key={row.label} aria-label={row.label} className="py-10">
                  {row.items.length > 1 ? (
                    <h2 className="px-3 pt-3 text-sm font-medium">{row.label}</h2>
                  ) : null}
                  <div
                    className={`flex min-w-0 justify-center overflow-hidden ${
                      items.length > 1
                        ? "[mask-image:linear-gradient(to_right,transparent_10%,black_25%,black_75%,transparent_90%)]"
                        : ""
                    }`}
                  >
                    <Carousel
                      aria-label={row.label}
                      className={
                        items.length > 1
                          ? "w-[350px] max-w-full [&>ul>li]:w-full"
                          : "w-max shrink-0"
                      }
                      overflow={items.length > 1}
                      loop={items.length > 1}
                      gap={0}
                      itemSize="manual"
                      safeMargin={items.length > 1 ? 200 : 0}
                      items={items.map(({ brickModule, layoutId, label, ...item }) => {
                        const previewId =
                          "previewId" in item && typeof item.previewId === "string"
                            ? item.previewId
                            : layoutId;
                        return (
                          <ModulePreview
                            key={`${brickModule.id}:${previewId}`}
                            brickModule={brickModule}
                            breakpoint={breakpoint}
                            cardStyle={cardStyle}
                            label={label}
                            sampleState={brickModule.previewStates?.[previewId]}
                            spec={candidateLibrary[brickModule.id].layouts[layoutId]}
                            onSelect={(state) =>
                              setSelected({
                                moduleId: brickModule.id,
                                layoutId,
                                state:
                                  brickModule.initialDraft === "preview"
                                    ? state
                                    : structuredClone(
                                        brickModule.initialDrafts?.[previewId] ?? brickModule.initialDraft,
                                      ),
                              })
                            }
                          />
                        );
                      })}
                    />
                  </div>
                </section>
              );
            })}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
