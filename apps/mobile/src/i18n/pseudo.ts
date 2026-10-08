import { pseudoLocalize } from "@agrorende/i18n";

/** Pseudo-localises text outside ICU braces only, so plural/select syntax survives. */
export function pseudoMessage(message: string): string {
  let depth = 0;
  let out = "";
  let text = "";
  const flush = () => {
    if (text.length > 0) out += pseudoLocalize(text).slice(1, -1).replace(/~+$/, "");
    text = "";
  };
  for (const char of message) {
    if (char === "{") {
      if (depth === 0) flush();
      depth += 1;
      out += char;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
      out += char;
    } else if (depth === 0) {
      text += char;
    } else {
      out += char;
    }
  }
  flush();
  return `[${out}${"~".repeat(Math.max(1, Math.ceil(message.length * 0.4)))}]`;
}

export function pseudoTree(value: unknown): unknown {
  if (typeof value === "string") return pseudoMessage(value);
  if (Array.isArray(value)) return value.map(pseudoTree);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pseudoTree(v)]));
  return value;
}
