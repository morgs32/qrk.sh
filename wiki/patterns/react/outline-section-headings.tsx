/**
 * Render section headings outside ordered outlines; give each section its own
 * Outline. Reset CSS counters on each list and keep markers out of label text.
 * Use label for the first line and children for the body. OutlineItem owns its
 * private body wrapper. A direct nested Outline indents the whole body by 2ch,
 * so sibling feedback aligns with the nested labels and controls. A body with
 * only controls stays aligned with its own label.
 *
 * @bad Render Repos as an OutlineItem in the Admin outline.
 * @bad Put section headings inside OutlineItems to number them.
 * @bad Hardcode numbers or letters in labels instead of using CSS counters.
 * @bad Add a wrapper or local indent just to align feedback with nested items.
 */
import { Outline, OutlineItem } from '@zerospin/fragment-ui/Outline';

export function StudioSections() {
  return (
    <>
      <h1>Admin</h1>
      <Outline aria-label="Admin" type="1">
        <OutlineItem label="Aggregates">
          <Outline type="A" data-numbering="upper-alpha">
            <OutlineItem label="user: 1.0.0" />
          </Outline>
          <p role="status">Loading more aggregates...</p>
        </OutlineItem>
      </Outline>

      <h1>Repos</h1>
      <Outline aria-label="Repos" type="A" data-numbering="upper-alpha">
        <OutlineItem label="SystemRepo" />
        <OutlineItem label="AggregateVersionRepo" />
      </Outline>
    </>
  );
}
