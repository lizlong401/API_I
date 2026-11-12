import { parseArgs } from "node:util";
import { enhancePrompt, type PromptInput, type Control } from "../nodes/prompt-creative-expansion.ts";

function selectControl(value: string | undefined): Control<string> {
  if (value === undefined || value === "auto") return { source: "auto" };
  return { source: "manual", value };
}

function selectBlur(value: string | undefined): Control<number> {
  const control = selectControl(value);
  if (control.source !== "manual") return control;
  if (!control.value.trim()) throw new Error("Provide a number after --blur");
  return { source: "manual", value: Number(control.value) };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      blur: { type: "string" },
      background: { type: "string" },
      framing: { type: "string" },
      lighting: { type: "string" },
      style: { type: "string" },
    },
  });
  const prompt = positionals.join(" ").trim();
  if (!prompt) {
    console.error('Usage: node --env-file=.env src/cli/prompt-creative-expansion.ts "your prompt" [--blur 0-100]');
    process.exitCode = 1;
    return;
  }

  const input: PromptInput = {
    idea: prompt,
    settings: {
      background: selectControl(values.background),
      framing: selectControl(values.framing),
      lighting: selectControl(values.lighting),
      style: selectControl(values.style),
      backgroundBlur: selectBlur(values.blur),
    },
  };

  const result = await enhancePrompt(input);
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Prompt enhancement failed";
  console.error(message);
  process.exitCode = 1;
}
