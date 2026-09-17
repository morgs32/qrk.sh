import { buildUserPrompt, compileSpecStream, isNonEmptySpec, type Spec } from "@json-render/core";

import { backendLibrary } from "../backendLibrary";
import type { IRpcEither, IScraperEnv } from "./types";

const GENERATE_MODEL = "gpt-5.6-luna";

function backendEntryForModuleId(moduleId: string) {
  if (moduleId in backendLibrary) {
    return backendLibrary[moduleId as keyof typeof backendLibrary];
  }
  return undefined;
}

function initialStateFromDocument(state: unknown): Record<string, unknown> {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const initialState: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      initialState[key] = value;
    }
    return initialState;
  }
  return { value: state };
}

function contentFromChatCompletion(body: unknown): string {
  if (body === null || typeof body !== "object" || !("choices" in body)) {
    throw new Error("OpenAI returned no choices");
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("OpenAI returned no choices");
  }
  const first = choices[0];
  if (first === null || typeof first !== "object" || !("message" in first)) {
    throw new Error("OpenAI returned no message content");
  }
  const message = first.message;
  if (message === null || typeof message !== "object" || !("content" in message)) {
    throw new Error("OpenAI returned no message content");
  }
  if (typeof message.content !== "string" || message.content.trim() === "") {
    throw new Error("OpenAI returned no message content");
  }
  return message.content;
}

function specFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/.exec(trimmed);
  const body = fenceMatch === null ? trimmed : fenceMatch[1].trim();
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object" && "root" in parsed && "elements" in parsed) {
      return parsed;
    }
  } catch {
    // Standalone catalog prompts ask for JSONL patches.
  }
  return compileSpecStream(body);
}

export async function generateSpec(props: {
  env: IScraperEnv;
  moduleId: string;
  prompt: string;
  state: unknown;
  currentSpec: Spec | null;
}): Promise<IRpcEither<Spec>> {
  const trimmedPrompt = props.prompt.trim();
  if (trimmedPrompt === "") {
    return {
      _tag: "Left",
      left: {
        code: "invalid-generate-request",
        message: "Prompt is required.",
      },
    };
  }

  const entry = backendEntryForModuleId(props.moduleId);
  if (entry === undefined || entry.catalog === undefined) {
    return {
      _tag: "Left",
      left: {
        code: "catalog-unavailable",
        message: `No json-render catalog for module ${JSON.stringify(props.moduleId)}.`,
      },
    };
  }

  const apiKey = props.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return {
      _tag: "Left",
      left: {
        code: "provider-configuration-error",
        message: "OPENAI_API_KEY is not configured.",
      },
    };
  }

  if (props.currentSpec !== null && !isNonEmptySpec(props.currentSpec)) {
    return {
      _tag: "Left",
      left: {
        code: "invalid-generate-request",
        message: "currentSpec must be a non-empty spec or null.",
      },
    };
  }

  const currentSpec = props.currentSpec;
  const catalog = entry.catalog;

  try {
    const system = catalog.prompt({ mode: "standalone" });
    const user = buildUserPrompt({
      prompt: trimmedPrompt,
      state: initialStateFromDocument(props.state),
      currentSpec,
    });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GENERATE_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const responseBody: unknown = await response.json();
    if (!response.ok) {
      const errorMessage =
        responseBody !== null &&
        typeof responseBody === "object" &&
        "error" in responseBody &&
        responseBody.error !== null &&
        typeof responseBody.error === "object" &&
        "message" in responseBody.error &&
        typeof responseBody.error.message === "string"
          ? responseBody.error.message
          : `OpenAI HTTP ${response.status}`;
      return {
        _tag: "Left",
        left: {
          code: "generate-failed",
          message: errorMessage,
          retryable: response.status >= 500,
        },
      };
    }
    const spec = specFromModelText(contentFromChatCompletion(responseBody));
    const validated = catalog.validate(spec);
    if (!validated.success || validated.data === undefined || !isNonEmptySpec(validated.data)) {
      return {
        _tag: "Left",
        left: {
          code: "invalid-generated-spec",
          message:
            validated.error === undefined
              ? "Generated spec failed catalog validation."
              : validated.error.message,
        },
      };
    }
    return { _tag: "Right", right: validated.data };
  } catch (cause) {
    return {
      _tag: "Left",
      left: {
        code: "generate-failed",
        message: cause instanceof Error ? cause.message : String(cause),
        retryable: true,
      },
    };
  }
}
