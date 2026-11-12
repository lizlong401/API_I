export type Control<T> =
  | { source: "auto" }
  | { source: "manual"; value: T };

export type PromptSettings = {
  backgroundBlur?: number | Control<number>;
  background?: string | Control<string>;
  framing?: string | Control<string>;
  lighting?: string | Control<string>;
  style?: string | Control<string>;
};

export type ManualSettings = {
  backgroundBlur?: number;
  background?: string;
  framing?: string;
  lighting?: string;
  style?: string;
};

export type ControlName = keyof ManualSettings;
export const controlNames: ControlName[] = ["backgroundBlur", "background", "framing", "lighting", "style"];

/** Resolve one source per control. Raw numbers/text remain manual shorthand. */
export function prepareControls(settings: PromptSettings = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("Prompt settings must be an object");
  }
  const manual: ManualSettings = {};
  for (const name of Object.keys(settings)) {
    if (!controlNames.some(control => control === name)) {
      throw new Error(`Unknown control: ${name}`);
    }
  }
  for (const name of controlNames) {
    let value = settings[name];
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === "object") {
      const allowed = value.source === "manual" ? ["source", "value"] : ["source"];
      if (Object.keys(value).some(key => !allowed.includes(key))) {
        throw new Error(`${name} must use only one source: auto or manual`);
      }
      if (value.source === "auto") {
        continue;
      }
      if (value.source !== "manual") {
        throw new Error(`Invalid source for ${name}`);
      }
      value = value.value;
    }
    if (name === "backgroundBlur") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error("Background blur must be a number between 0 and 100");
      }
      manual.backgroundBlur = value;
    } else {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${name} must be non-empty text`);
      }
      manual[name] = value.trim();
    }
  }
  return manual;
}
