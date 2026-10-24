import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NOT_BUILT_LINE,
  PrintDraft,
  PrintPages,
  WATERMARK,
  printLines,
  shortName,
} from "../src/ui/SrsPrint.tsx";
import type { PacketSection } from "../src/data/srsPacket.ts";

describe("shortName", () => {
  it("is first name and last initial", () => {
    expect(shortName({ first_name: "Sam", last_name: "Rivers", preferred_name: null })).toBe(
      "Sam R.",
    );
  });
  it("prefers the preferred name and tolerates a missing last name", () => {
    expect(shortName({ first_name: "Samuel", last_name: "Rivers", preferred_name: "Sam" })).toBe(
      "Sam R.",
    );
    expect(shortName({ first_name: "Sam", last_name: " ", preferred_name: null })).toBe("Sam");
  });
});

describe("printLines", () => {
  it("prints the text and the pick label", () => {
    expect(printLines({ label: "A", text: "hello", pick: "Yes" })).toEqual([
      "hello",
      "Pick in SRS: Yes",
    ]);
  });
  it("lists a blocked item as not ready and prints none of its text", () => {
    expect(printLines({ label: "A", text: "partial", blocked: "Fill in the date" })).toEqual([
      "Not ready: Fill in the date",
    ]);
  });
  it("prints nothing for an item with no text", () => {
    expect(printLines({ label: "A" })).toEqual([]);
  });
});

describe("PrintPages", () => {
  const student = { first_name: "Sam", last_name: "Rivers", preferred_name: null };
  const sections: PacketSection[] = [
    {
      id: "plaafp",
      title: "Present level",
      built: true,
      items: [{ id: "i1", label: "Reading", text: "Reads at grade level." }],
    },
    {
      id: "lre",
      title: "Placement",
      built: true,
      items: [{ id: "i2", label: "Box", text: "partial", blocked: "Write the placement" }],
    },
    { id: "esy", title: "Extended school year", built: false, items: [] },
  ];
  const html = renderToString(
    createElement(PrintPages, { student, sections, today: "October 22, 2026" }),
  );
  it("carries the watermark, a short name and every section in order", () => {
    expect(html).toContain(WATERMARK);
    expect(html).toContain("Sam R.");
    expect(html).not.toContain("Rivers");
    expect(html.indexOf("Present level")).toBeLessThan(html.indexOf("Placement"));
    expect(html.indexOf("Placement")).toBeLessThan(html.indexOf("Extended school year"));
  });
  it("prints item text, lists blocked items and marks unbuilt sections", () => {
    expect(html).toContain("Reads at grade level.");
    expect(html).toContain("Not ready: Write the placement");
    expect(html).not.toContain("partial");
    expect(html).toContain(NOT_BUILT_LINE);
  });
});

describe("PrintDraft", () => {
  it("shows the Print draft button without a document", () => {
    const student = { first_name: "Sam", last_name: "Rivers", preferred_name: null } as never;
    const html = renderToString(createElement(PrintDraft, { student, sections: [] }));
    expect(html).toContain("Print draft");
  });
});
