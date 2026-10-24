import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { More } from "../src/ui/Home.tsx";

describe("More tab", () => {
  it("announces the practice data counts to the director", () => {
    setRole("sped_director");
    const html = renderToString(createElement(More));
    expect(html).toMatch(/<p class="meta" role="status">\d+<!-- --> student/);
    setRole(null);
  });
});
