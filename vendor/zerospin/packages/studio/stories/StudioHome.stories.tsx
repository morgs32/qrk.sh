import type { Meta, StoryObj } from '@storybook/react-vite';
import { newHttpBatchRpcResponse } from 'capnweb';
import { http } from 'msw/http';

import {
  FixtureStudioAgentApi,
  HomepageFixture,
  setUpStoryAppearance,
  type IHomepageOptions,
} from './homepageFixture.js';
import { HomepagePreview } from './HomepagePreview.js';

const meta = {
  title: 'Studio/Homepage',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
} satisfies Meta;

export default meta;
type IStory = StoryObj<typeof meta>;

function makeHomepageStory(options: IHomepageOptions): IStory {
  let fixture: HomepageFixture | undefined;
  let cleanup: (() => void) | undefined;
  return {
    parameters: {
      msw: [
        http.post('/api/agents/rpc', ({ request }) => {
          const run = fixture;
          if (run === undefined) {
            throw new Error('Homepage story is not ready for requests.');
          }
          return newHttpBatchRpcResponse(
            request,
            new FixtureStudioAgentApi(run),
          );
        }),
      ],
    },
    beforeEach() {
      cleanup?.();
      const run = new HomepageFixture(options.scenario);
      fixture = run;
      const restoreAppearance = setUpStoryAppearance(options);
      let disposed = false;
      cleanup = () => {
        if (disposed) return;
        disposed = true;
        run.dispose();
        restoreAppearance();
        if (fixture === run) {
          fixture = undefined;
          cleanup = undefined;
        }
      };
      return cleanup;
    },
    render() {
      if (fixture === undefined) {
        throw new Error('Homepage story is not ready.');
      }
      return (
        <HomepagePreview
          key={fixture.runId}
          fixture={fixture}
          options={options}
        />
      );
    },
  };
}

export const Registered = makeHomepageStory({
  scenario: 'registered',
  description:
    'Search alpha in admin and beta in reader to check independent filters. Search an unknown ID for no matches. Use ArrowDown and Enter to select an ID and inspect the encoded route. Select the space or long ID at narrow widths to check popup wrapping. Both pickers share one ID request. Repo links also display their pathname.',
});

export const Loading = makeHomepageStory({
  scenario: 'loading',
  probe: 'off',
  description:
    'Responses stay pending until their numbered release buttons are pressed. Enable the probe, switch its aggregate name or version before releasing the previous request, and release the newer request first: the old result must not replace the selected query. Disable the probe to check that it makes no request. Switching stories or remounting settles held responses.',
});

export const FailureAndRetry = makeHomepageStory({
  scenario: 'failure',
  refresh: true,
  description:
    'The initial request fails. Retry in the homepage succeeds. Then press Fail next query and Refresh homepage IDs: the error returns while cached IDs remain selectable. Retry clears that refresh error. Request counts increase once per shared lookup.',
});

export const Empty = makeHomepageStory({
  scenario: 'empty',
  description:
    'The API returns an empty list. The homepage shows No registered aggregate IDs, and both pickers are disabled.',
});

export const NoAgents = makeHomepageStory({
  scenario: 'no-agents',
  description:
    'This aggregate has no declared agents. The homepage shows No agents declared and makes zero ID requests.',
});

export const MalformedIds = makeHomepageStory({
  scenario: 'invalid',
  description:
    'Cap’n Web returns a successful envelope containing an invalid aggregate ID. Production response validation rejects it, and the homepage displays an error.',
});

export const SharedQueries = makeHomepageStory({
  scenario: 'registered',
  probe: 'primary',
  description:
    'The probe and homepage use the same aggregate name/version and share one request. Refresh probe updates that shared query. Disable the probe to check that it sends no additional request.',
});

export const SeparateQueries = makeHomepageStory({
  scenario: 'registered',
  probe: 'secondary',
  description:
    'The homepage and probe start with different aggregate names, producing two requests and distinct IDs. Select Different aggregate version to see acct_version_two, then switch back to inspect the separate caches. Disabled sends no request.',
});

export const FocusAndReconnect = makeHomepageStory({
  scenario: 'registered',
  events: true,
  description:
    'Add a registered ID, then simulate focus or reconnect to refresh the picker results. Production SWR deduplication and focus throttling remain enabled: wait over five seconds between focus checks and over two seconds after a lookup before reconnect. Fail next query checks refresh errors with cached IDs retained.',
});

export const Light = makeHomepageStory({
  scenario: 'registered',
  theme: 'light',
  description:
    'Start in Light. Open the theme menu, change themes while filtering an ID, and check that the filter survives and the open picker and menu use the homepage theme.',
});

export const Dark = makeHomepageStory({
  scenario: 'registered',
  theme: 'dark',
  description:
    'Start in Dark. Check the homepage, picker popup, and theme menu. Theme changes preserve the current picker filter.',
});

export const System = makeHomepageStory({
  scenario: 'registered',
  theme: 'system',
  description:
    'Start in System. The homepage follows the browser’s preferred color scheme, including live preference changes. Light and Dark remain selectable in its theme menu.',
});

export const BlockedStorage = makeHomepageStory({
  scenario: 'registered',
  theme: 'system',
  blockedStorage: true,
  description:
    'Preference storage throws SecurityError. The homepage starts in System and still changes to Light or Dark for this visit. Switching stories restores the original localStorage property and saved preference.',
});
