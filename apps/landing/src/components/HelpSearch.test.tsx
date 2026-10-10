// @vitest-environment jsdom
import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SITE_LOCALES } from "@/lib/locales";
import { helpErrorBase, helpErrorPath } from "@/lib/routes";

import { helpCodeHref, HelpSearch, type HelpSearchGroup } from "./HelpSearch";

const groups: HelpSearchGroup[] = [
  ["SYN", "Sync", [["FIRST_SYNC_LARGE", "Baixando dados para trabalhar offline"]]],
  ["FR", "Field records", [["PHOTO_TOO_LARGE", "Foto grande demais"], ["SINAL_FRACO", "Sinal fraco"]]],
];
const labels = { searchLabel: "Search", searchPlaceholder: "Code", searchEmpty: "Nothing found", countOne: "1 code", countOther: "{count} codes" };

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("HelpSearch", () => {
  it("builds the same href as the route table for every code and locale", () => {
    for (const locale of SITE_LOCALES) {
      for (const code of ALL_ERROR_CODES) expect(helpCodeHref(helpErrorBase(locale), code)).toBe(helpErrorPath(code, locale));
    }
  });

  it("lists every code, then filters accent- and case-insensitively", () => {
    render(<HelpSearch groups={groups} hrefBase="/pt-br/ajuda/erros/" labels={labels} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toBe("3 codes");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first sync" } });
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/pt-br/ajuda/erros/first-sync-large/"]);
    expect(screen.getByRole("status").textContent).toBe("1 code");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SÍNAL" } });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Nothing found");
  });

  it("reads the query from ?q", () => {
    window.history.replaceState(null, "", "/pt-br/ajuda/?q=foto");
    render(<HelpSearch groups={groups} hrefBase="/pt-br/ajuda/erros/" labels={labels} />);
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "foto");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
