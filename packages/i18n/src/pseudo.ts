const accents = new Map<string, string>([
  ["a", "á"],
  ["b", "ƀ"],
  ["c", "ç"],
  ["d", "ď"],
  ["e", "é"],
  ["f", "ƒ"],
  ["g", "ğ"],
  ["h", "ĥ"],
  ["i", "í"],
  ["j", "ĵ"],
  ["k", "ķ"],
  ["l", "ľ"],
  ["m", "ɱ"],
  ["n", "ñ"],
  ["o", "ó"],
  ["p", "ƥ"],
  ["q", "ʠ"],
  ["r", "ŕ"],
  ["s", "š"],
  ["t", "ţ"],
  ["u", "ú"],
  ["v", "ṽ"],
  ["w", "ŵ"],
  ["x", "ẋ"],
  ["y", "ý"],
  ["z", "ž"],
]);

function accentChar(char: string): string {
  const lower = char.toLowerCase();
  const accented = accents.get(lower);
  if (accented === undefined) {
    return char;
  }

  return char === lower ? accented : accented.toUpperCase();
}

export function pseudoLocalize(message: string): string {
  const protectedParts = message.split(/({[^}]+})/g);
  const accented = protectedParts
    .map((part) => (part.startsWith("{") && part.endsWith("}") ? part : Array.from(part, accentChar).join("")))
    .join("");
  const paddingLength = Math.ceil(accented.length * 0.4);
  const padding = "~".repeat(Math.max(1, paddingLength));
  return `[${accented}${padding}]`;
}

export function pseudoLocalizeTree(value: unknown): unknown {
  if (typeof value === "string") {
    return pseudoLocalize(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => pseudoLocalizeTree(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, pseudoLocalizeTree(child)]));
  }

  return value;
}

export const PSEUDO_LOCALE = "en-XA";
