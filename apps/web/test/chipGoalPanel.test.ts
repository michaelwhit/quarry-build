import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { STATUS_LABEL, type GoalStatus } from "../src/data/derive.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { Chip } from "../src/ui/Chip.tsx";
import { GoalPanel } from "../src/ui/GoalPanel.tsx";

setRole("sped_director");

describe("Chip", () => {
  const all = Object.keys(STATUS_LABEL) as GoalStatus[];
  it("never relies on colour alone: each status has a hidden symbol and its words", () => {
    const symbols = new Set<string>();
    for (const status of all) {
      const html = renderToString(createElement(Chip, { status }));
      expect(html).toContain(`class="chip ${status}"`);
      expect(html).toContain(STATUS_LABEL[status]);
      const m = html.match(/<span aria-hidden="true">([^<]+)<\/span>/);
      expect(m, status).not.toBeNull();
      symbols.add(m![1]!);
    }
    expect(symbols.size).toBe(all.length);
  });
});

describe("GoalPanel", () => {
  beforeEach(() => {
    loadSample();
  });
  const firstGoal = () => {
    const g = students.flatMap((s) => s.goals)[0]!;
    return { goal: g.goal, plan: g.plan };
  };
  it("is open by default and shows the whole goal, baseline, target and criteria", () => {
    const { goal, plan } = firstGoal();
    const html = renderToString(createElement(GoalPanel, { goal, plan }));
    expect(html).toContain("<details");
    expect(html).toMatch(/<details[^>]* open/);
    expect(html).toContain("Whole goal");
    for (const label of ["Measured by", "Baseline", "Target", "Criteria"])
      expect(html).toContain(label);
    expect(html).not.toContain("scrollable");
  });
  it("is keyboard reachable and named when the height is capped", () => {
    const { goal, plan } = firstGoal();
    const html = renderToString(createElement(GoalPanel, { goal, plan, capHeight: true }));
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Whole goal, scrollable"');
  });
  it("lists prompt levels and task steps only when the plan has them", () => {
    const { goal, plan } = firstGoal();
    const bare = { ...plan, prompt_hierarchy: [], task_steps: [] };
    const without = renderToString(createElement(GoalPanel, { goal, plan: bare }));
    expect(without).not.toContain("Prompt levels");
    expect(without).not.toContain("<dt>Steps</dt>");
    const full = { ...plan, prompt_hierarchy: ["Full", "Gesture"], task_steps: ["Open", "Pour"] };
    const withBoth = renderToString(createElement(GoalPanel, { goal, plan: full }));
    expect(withBoth).toContain("Full → Gesture");
    expect(withBoth).toContain("Open, Pour");
  });
});
