import { textV1 } from "../src/modules/text/definition/textV1";
import { articleV1 } from "../src/modules/article/definition/articleV1";
import { generateSpec } from "./generateSpec";

afterEach(() => vi.restoreAllMocks());

it("generates a spec using the Brick and Placement state namespaces", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(textV1.defaultSpec) } }],
    })),
  );
  const result = await generateSpec({
    env: { OPENAI_API_KEY: "test-key" },
    moduleId: "text",
    prompt: "Show the text",
    state: { brickState: { content: "Hello" }, placementState: { fontFamily: "sans", fontSizePx: 16 } },
    currentSpec: textV1.defaultSpec,
  });

  expect(result).toEqual({ _tag: "Right", right: textV1.defaultSpec });
  const request = JSON.parse(fetch.mock.calls[0][1].body);
  expect(request.messages[0].content).toContain("Bind Brick content under /brickState and Placement settings under /placementState");
  expect(request.messages[1].content).toContain("Hello");
});

it("retains the flat-state prompt for existing generation callers", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(articleV1.defaultSpec) } }],
    })),
  );
  const result = await generateSpec({
    env: { OPENAI_API_KEY: "test-key" },
    moduleId: "article",
    prompt: "Show the text",
    state: { title: "Hello", subtitle: "", content: null },
    currentSpec: articleV1.defaultSpec,
  });

  expect(result).toEqual({ _tag: "Right", right: articleV1.defaultSpec });
  const request = JSON.parse(fetch.mock.calls[0][1].body);
  expect(request.messages[0].content).not.toContain("Bind Brick content under /brickState and Placement settings under /placementState");
  expect(request.messages[1].content).toContain("Hello");
});
