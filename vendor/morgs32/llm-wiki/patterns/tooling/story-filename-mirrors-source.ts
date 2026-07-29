/**
 * Name a colocated story file with the source file's exact basename followed by `.stories`.
 *
 * @bad Do not invent a component-style story filename for a route source, such as
 * `BookingPage.stories.tsx` beside `page.tsx`.
 * @bad Do not let story filenames drift from the test convention of mirroring the file under test.
 */
import Page from './page';

export default {
  component: Page,
};
