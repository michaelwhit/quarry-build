import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import {
  resetPlacementForTests,
  setPlacement,
  usePlacementStorage,
} from "../src/data/placement.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { HealthPeForm, LreForm, TransportationForm } from "../src/ui/placementForms.tsx";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;

beforeEach(() => {
  loadSample();
  usePlacementStorage(mem());
  resetPlacementForTests();
});

describe("placement forms", () => {
  it("LreForm has one named text box under its summary", () => {
    const html = renderToString(createElement(LreForm, { studentId: sid() }));
    expect(html).toContain("Write the placement");
    expect(html).toContain("Least restrictive environment placement");
    expect(html.match(/<textarea/g)?.length).toBe(1);
  });
  it("HealthPeForm has two named text boxes", () => {
    const html = renderToString(createElement(HealthPeForm, { studentId: sid() }));
    expect(html).toContain("Write health and Physical Education");
    expect(html).toContain("Health and self-care needs");
    expect(html).toContain("Physical Education");
    expect(html.match(/<textarea/g)?.length).toBe(2);
  });
  it("shows what was already written", () => {
    setPlacement(sid(), { lre: "Learns in the general classroom most of the day." });
    const html = renderToString(createElement(LreForm, { studentId: sid() }));
    expect(html).toContain("Learns in the general classroom most of the day.");
  });
  it("TransportationForm is a fieldset with a legend and Yes and No radios, none chosen at first", () => {
    const html = renderToString(createElement(TransportationForm, { studentId: sid() }));
    expect(html).toContain("<legend>Child qualifies for special education transportation</legend>");
    expect(html.match(/type="radio"/g)?.length).toBe(2);
    expect(html).not.toContain("checked");
  });
  it("TransportationForm marks only the saved answer", () => {
    setPlacement(sid(), { transport: "yes" });
    const html = renderToString(createElement(TransportationForm, { studentId: sid() }));
    expect(html.match(/checked/g)?.length).toBe(1);
    expect(html.indexOf("checked")).toBeLessThan(html.indexOf("Yes"));
  });
  it("TransportationForm marks No when No was saved", () => {
    setPlacement(sid(), { transport: "no" });
    const html = renderToString(createElement(TransportationForm, { studentId: sid() }));
    expect(html.match(/checked/g)?.length).toBe(1);
    expect(html.indexOf("checked")).toBeGreaterThan(html.indexOf("Yes"));
  });
});
