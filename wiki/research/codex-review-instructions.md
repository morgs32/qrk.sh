# Codex review instructions outside AGENTS.md

Researched 2026-10-21 against current official OpenAI documentation. This distinguishes the desktop Code Review plugin, local `/review`, and the GitHub review bot. No instruction files or settings were changed.

## Answer

**There are supported alternatives.** Which one applies depends on how the review starts:

| Review surface | Instructions outside AGENTS.md | Scope |
| --- | --- | --- |
| Desktop Code Review plugin, **Review with Codex** | **Review instructions** gear, also **Settings > Code Review** | Saved criteria across repositories for reviews started with that button. Changes affect the next review. [Official guide](https://learn.chatgpt.com/docs/code-review#customize-your-review). |
| Pull request chat | Direct instructions; installed skills and connected guidelines/design documents | The review conversation. Automatic cloud reviews are separate. [Official guide](https://learn.chatgpt.com/docs/code-review#ask-questions-about-the-change). |
| GitHub `@codex review` | Extra focus in the triggering comment | One review request; the documented example is `@codex review for issues in the database migration`. [GitHub integration](https://learn.chatgpt.com/docs/third-party/github#customize-what-codex-reviews). |
| CLI `/review` | **Custom review instructions** preset | Criteria supplied for that review. [Review scopes](https://learn.chatgpt.com/docs/code-review#choose-a-review-scope). |
| CLI `codex review` | A custom prompt argument, or `-` to read it from stdin | Non-interactive review. Explicit target flags and a custom prompt conflict; see below. [Command reference](https://learn.chatgpt.com/docs/developer-commands#codex-review). |

The desktop settings above are documented specifically for **Review with Codex**. Do not assume they also configure the GitHub bot, automatic cloud reviews, or local `/review`. The local app workflow documents branch/uncommitted presets, rather than a shared review-instructions setting. [Code review guide](https://learn.chatgpt.com/docs/code-review).

## What still belongs to AGENTS.md

For repository-wide instructions automatically picked up by GitHub reviews, the documented mechanism remains applicable `AGENTS.md` files. Root rules cover the repository; nested files scope rules to a service or directory. The GitHub settings documentation covers enablement, personal preferences, and triggers; it does not establish an alternative persistent free-text rules field. [GitHub integration](https://learn.chatgpt.com/docs/third-party/github#customize-what-codex-reviews).

To reduce the root file, a practical proposal is one conditional directive:

```md
## Code Review Rules

When reviewing code or a pull request, read and follow wiki/review-guidelines.md.
```

**This is a proposed instruction pattern, not a documented automatic include feature.** A separate `review-guidelines.md` filename has no established special discovery behavior in the cited review documentation. The directive asks the reviewer to read it; the file must be available in the review checkout. Keep the most consequential rules directly in `AGENTS.md` if automatic GitHub review reliability is the priority. OpenAI recommends a small set of scoped rules describing both the invariant and its safe path. [Custom rules guidance](https://developers.openai.com/blog/custom-code-review-rules-for-codex).

## CLI examples and limitation

These use the documented custom-prompt interface:

```sh
# Supply criteria directly, including the intended comparison in the prompt.
codex review 'Review changes against main. Read wiki/review-guidelines.md first.'

# Or supply a complete review request from a standalone text file.
codex review - < review-request.md
```

The first command expresses the comparison in natural language; it is not the structured `--base` target. Current documentation explicitly says that `--uncommitted`, `--base`, `--commit`, and custom `PROMPT` conflict with one another. Therefore, do not recommend `codex review --base main 'extra instructions'`. [Command reference](https://learn.chatgpt.com/docs/developer-commands#codex-review).

Local confirmation: the installed CLI reports **codex-cli 0.147.0**; `codex review --help` advertises `[PROMPT]`, including stdin via `-`, plus the target flags. The conflict rule above comes from documentation, not an executed review.

## Configuration and skills

The configuration reference describes `developer_instructions` as session instructions and `model_instructions_file` as replacing built-in instructions. Neither is documented there as a dedicated additive review-policy file. Do not use replacement model instructions merely to store a review checklist. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Skills are explicitly supported as context in the desktop pull request chat. That does not establish that a locally installed skill is automatically available to the separately hosted GitHub reviewer. [Code review guide](https://learn.chatgpt.com/docs/code-review#ask-questions-about-the-change).

## Recommendation

Use the desktop **Review instructions** setting for personal cross-repository review preferences. Use a dedicated review skill or file for longer team guidance in review chats. For automatic GitHub reviews, retain a very short `AGENTS.md` review section, using a separate-file directive only with the caveat above. Use the triggering comment for one-off GitHub focus. These choices keep general coding instructions small without assuming all review surfaces share configuration.
