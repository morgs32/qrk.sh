# llm-wiki

Shareable LLM guidance vendored from
[`morgs32/llm-wiki`](https://github.com/morgs32/llm-wiki) as a squashed Git
subtree. Start at [`patterns/README.md`](./patterns/README.md).

## Subrepo metadata

- Upstream: `https://github.com/morgs32/llm-wiki.git`
- Branch: `main`

From the Zerospin repository root, occasionally pull upstream changes with:

```bash
git subtree pull --prefix=vendor/morgs32/llm-wiki https://github.com/morgs32/llm-wiki.git main --squash
```

Publish local subtree changes upstream only after reviewing the split history:

```bash
git subtree push --prefix=vendor/morgs32/llm-wiki https://github.com/morgs32/llm-wiki.git main
```
