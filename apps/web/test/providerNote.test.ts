import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type ProviderState,
  SERVICES_KEY,
  providerNote,
  useServicesStorage,
} from "../src/data/serviceRows.ts";
import { Form } from "../src/ui/srs/services.tsx";

// A related service says "Needs a provider" when none is named and "Needs a new provider" when the
// named person is paused, removed, role-ended or in another role. Rows with no provider data (practice and sample
// rows) say nothing, so the practice app looks the same as before.
const related = (provider: { state: ProviderState } | null) => ({
  kind: "related" as const,
  provider,
});

describe("provider note on a service row", () => {
  it("says nothing when the row carries no provider data", () => {
    expect(providerNote({ kind: "related" })).toBeNull();
  });
  it("needs a provider when a related service names nobody", () => {
    expect(providerNote(related(null))).toBe("Needs a provider");
  });
  it("needs a new provider when the named person is paused, removed, role-ended or in another role", () => {
    for (const state of ["paused", "removed", "role_ended", "role_changed"] as const)
      expect(providerNote(related({ state }))).toBe("Needs a new provider");
  });
  it("says nothing for an active provider", () => {
    expect(providerNote(related({ state: "active" }))).toBeNull();
  });
  it("applies to related services only", () => {
    for (const kind of ["special_education", "supports_personnel", "accommodation"] as const)
      expect(providerNote({ kind, provider: null })).toBeNull();
  });
});

describe("provider note on the Services screen", () => {
  const row = (id: string, extra: object) => ({
    id,
    kind: "related",
    title: id,
    start: "2026-08-20",
    end: "",
    frequency: "2 x weekly",
    duration: "30 min",
    location: "Resource room",
    followsCalendar: false,
    ...extra,
  });
  const html = (rows: object[]) => {
    const data = JSON.stringify([{ studentId: "s1", nextId: 9, rows }]);
    useServicesStorage({ getItem: () => data, setItem: () => undefined });
    return renderToString(createElement(Form, { studentId: "s1" })).replace(/<!-- -->/g, "");
  };
  it("shows the note on server rows and nothing on practice rows", () => {
    const out = html([
      row("Speech", { provider: null }),
      row("Reading", { provider: { state: "paused" } }),
      row("Motor", { provider: { state: "active" } }),
      row("Practice", {}),
    ]);
    expect(out.match(/Needs a provider/g)).toHaveLength(1);
    expect(out.match(/Needs a new provider/g)).toHaveLength(1);
    useServicesStorage(null);
    expect(SERVICES_KEY).toBeTruthy();
  });
  it("drops a row whose provider state is not one we know", () => {
    expect(html([row("Odd", { provider: { state: "gone" } })])).not.toContain("Odd");
  });
});
