import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MyItemsOffer } from "../src/ui/MyItemsOffer.tsx";

const noop = () => undefined;
const goal = {
  title: "Add within 20",
  statement:
    "Given 10 single-digit addition problems, Yara will write the correct sum for 8 of 10 problems in 3 consecutive sessions by 2027-05-20.",
  criteria: "At or above 80%, 3 times in a row",
  area: "math" as const,
  type: "percent_correct" as const,
  unit: "percent",
  targetValue: 80,
  trialsPerSession: null,
  promptHierarchy: [],
  taskSteps: [],
  names: ["Yara"],
  gradeBand: "K-2" as const,
};
const draw = (on: boolean) =>
  renderToString(
    createElement(MyItemsOffer, { goal, on, onToggle: noop, onTitle: noop }),
  ).replaceAll("<!-- -->", "");

describe("My items offer on the goal form", () => {
  it("is a single unticked checkbox until the teacher opts in", () => {
    const html = draw(false);
    expect(html).toContain("Also add this wording to my goal library");
    expect(html).not.toContain("Name in My items");
  });

  it("asks for a name and explains the blank once ticked", () => {
    const html = draw(true);
    expect(html).toContain("Name in My items");
    expect(html).toContain("becomes a blank");
  });
});
