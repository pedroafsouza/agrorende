import { describe, expect, it } from "vitest";

import { formatServerMessage, renderIcu, resolveServerLocale, serverMessage } from "../src/server.js";

describe("renderIcu", () => {
  it("substitutes arguments and drops missing ones", () => {
    expect(renderIcu("{name} commented on {title}.", { name: "Ana", title: "Trator" }, "en")).toBe("Ana commented on Trator.");
    expect(renderIcu("Hello {missing}", {}, "en")).toBe("Hello");
  });

  it("selects plural categories, exact matches and #", () => {
    const template = "{count, plural, =0 {nothing} one {# item} other {# items}} left";
    expect(renderIcu(template, { count: 0 }, "en")).toBe("nothing left");
    expect(renderIcu(template, { count: 1 }, "en")).toBe("1 item left");
    expect(renderIcu(template, { count: 3 }, "pt-BR")).toBe("3 items left");
  });
});

describe("server catalogue", () => {
  it("reads nested keys from the notifications and exports namespaces", () => {
    expect(serverMessage("en", "notifications", "WO_ASSIGNED.title")).toBe("New job assigned");
    expect(serverMessage("pt-BR", "exports", "boolean.true")).toBe("Sim");
    expect(serverMessage("en", "exports", "headers.unknown")).toBeUndefined();
    expect(formatServerMessage("pt-BR", "notifications", "sync.sent.body", { count: 2 })).toBe("2 itens foram enviados com segurança.");
  });

  it("resolves stored locales with a pt-BR fallback", () => {
    expect(resolveServerLocale("en-GB")).toBe("en");
    expect(resolveServerLocale(undefined)).toBe("pt-BR");
  });
});
