import type { ManualSettings, PromptSettings } from "./controls.ts";

export type PromptFields = {
  subject: string;
  action: string | null;
  setting: string | null;
  background: string | null;
  framing: string | null;
  focus: string | null;
  lighting: string | null;
  style: string | null;
  constraints: string[];
  appearance: string | null;
  props: string | null;
  textures: string | null;
  mood: string | null;
};

export type PromptResult = { text: string; fields: PromptFields };

export type PromptInput = {
  idea: string;
  settings?: PromptSettings;
  constraints?: string[];
};

// Control parsing has already validated settings before these helpers run.
export type ResolvedPromptInput = Omit<PromptInput, "settings"> & {
  settings: ManualSettings;
};

const textSettings = ["background", "framing", "lighting", "style"] as const;

const blurScale = {
  0: "Subject and background equally sharp",
  50: "Subject sharp, background soft but recognizable",
  100: "Subject sharp, background reduced to indistinct shapes",
};

/** Keep exact slider values so Gemini can describe their position on the scale. */
export function buildPrompt(input: ResolvedPromptInput): string {
  validateInput(input);
  const backgroundBlur = input.settings?.backgroundBlur;

  return JSON.stringify({
    idea: input.idea.trim(),
    settings: input.settings,
    constraints: input.constraints,
    backgroundBlur: backgroundBlur === undefined ? undefined : {
      value: backgroundBlur,
      scale: blurScale,
    },
  });
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(hasText);
}

function validateInput(input: ResolvedPromptInput): void {
  if (!input || !hasText(input.idea)) {
    throw new Error("Enter an idea to enhance");
  }
  if (input.constraints !== undefined && !isTextList(input.constraints)) {
    throw new Error("Constraints must be an array of non-empty strings");
  }
}

const textFields = [
  "subject", "appearance", "action", "setting", "background", "props",
  "framing", "focus", "lighting", "style", "textures", "mood",
] as const;
const fieldNames: string[] = [...textFields, "constraints"];

// Use null for details that do not apply to the scene.
export const promptSchema = {
  type: "OBJECT",
  properties: {
    ...Object.fromEntries(textFields.map(name => [name, {
      type: "STRING", nullable: name !== "subject",
    }])),
    constraints: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [...textFields, "constraints"],
  propertyOrdering: [...textFields, "constraints"],
};

export function validateFields(value: unknown): asserts value is PromptFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini must return a prompt object");
  }
  const fields = value as Record<string, unknown>;
  for (const name of textFields) {
    const text = fields[name];
    if (text === null && name !== "subject") {
      continue;
    }
    if (!hasText(text)) {
      throw new Error(`Missing or invalid prompt field: ${name}`);
    }
  }
  if (!isTextList(fields.constraints)) {
    throw new Error("Prompt constraints must be an array of non-empty strings");
  }
  if (Object.keys(fields).some(name => !fieldNames.includes(name))) {
    throw new Error("Gemini returned an unknown prompt field");
  }
}

function joinSentences(parts: (string | null | undefined)[]): string {
  const sentences: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      continue;
    }
    const text = part.trim();
    const hasEnding = /[.!?。！？]$/.test(text);
    sentences.push(hasEnding ? text : `${text}.`);
  }
  return sentences.join(" ");
}

export function assemblePrompt(fields: PromptFields): string {
  validateFields(fields);
  const scene = joinSentences([
    fields.subject, fields.appearance, fields.action, fields.setting, fields.background, fields.props,
  ]);
  const direction = joinSentences([fields.framing, fields.focus, fields.lighting, fields.style]);
  const details = joinSentences([fields.textures, fields.mood]);
  const constraints = joinSentences(fields.constraints);

  // Creative briefs follow scene → camera/light/style → texture/mood → constraints.
  return [scene, direction, details, constraints].filter(Boolean)
    .join("\n\n");
}

export function finishPrompt(value: unknown, input: ResolvedPromptInput): PromptResult {
  validateFields(value);
  const fields = { ...value, constraints: [...value.constraints] };

  for (const name of textSettings) {
    const selected = input.settings?.[name];
    if (selected !== undefined) {
      fields[name] = selected.trim();
    }
  }
  fields.constraints = [...new Set([...fields.constraints, ...(input.constraints ?? [])])];

  if (input.settings?.backgroundBlur !== undefined && !fields.focus) {
    throw new Error("Gemini omitted the selected background focus");
  }

  return { text: assemblePrompt(fields), fields };
}
