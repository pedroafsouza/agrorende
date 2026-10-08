// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CpfCnpjInput, taxIdError } from "./CpfCnpjInput";

function Harness() {
  const [value, setValue] = useState("");
  return <CpfCnpjInput aria-label="tax id" onChange={setValue} value={value} />;
}

describe("CpfCnpjInput", () => {
  afterEach(() => {
    cleanup();
  });

  it("masks a CPF while typing", async () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("tax id");
    await userEvent.type(input, "52998224725");
    expect(input.value).toBe("529.982.247-25");
    expect(input.inputMode).toBe("numeric");
  });

  it("switches to the CNPJ mask after 11 digits", async () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("tax id");
    await userEvent.type(input, "11222333000181");
    expect(input.value).toBe("11.222.333/0001-81");
  });

  it("validates check digits", () => {
    expect(taxIdError("")).toBeNull();
    expect(taxIdError("529.982.247-25")).toBeNull();
    expect(taxIdError("11.222.333/0001-81")).toBeNull();
    expect(taxIdError("529.982.247-26")).toBe("invalid");
  });
});
