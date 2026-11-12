import { Button } from "@qrk.sh/bricks/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qrk.sh/bricks/components/tabs";
import { categories } from "@qrk.sh/bricks/modules/react/categories";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
}) {
  const { breakpoint, cardStyle } = props;
  const modules = Object.values(modulesHash);
  const visibleCategories = categories.filter((category) =>
    modules.some((brickModule) => brickModule.categoryIds.includes(category.id)),
  );
  return (
    <Tabs defaultValue="all" className="h-full min-h-0 w-full min-w-0 gap-0">
      <TabsList
        variant="line"
        activateOnFocus
        aria-label="Brick categories"
        className="flex h-auto min-h-9 w-full shrink-0 flex-wrap justify-start gap-x-3 gap-y-0 border-0 border-b border-sidebar-border px-3 font-sans"
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
        <TabsContent value="all" className="mt-0">
          {modules.map((brickModule) => (
            <ModulePreview
              key={brickModule.id}
              brickModule={brickModule}
              breakpoint={breakpoint}
              cardStyle={cardStyle}
            />
          ))}
        </TabsContent>
        {visibleCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-0">
            {modules
              .filter((brickModule) => brickModule.categoryIds.includes(category.id))
              .map((brickModule) => (
                <ModulePreview
                  key={brickModule.id}
                  brickModule={brickModule}
                  breakpoint={breakpoint}
                  cardStyle={cardStyle}
                />
              ))}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
