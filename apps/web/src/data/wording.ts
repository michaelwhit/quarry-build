/** "1 goal", "2 goals": a count with its noun in the right number. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** "Grade 3", or "" when the grade is hidden or not set (paras see no grade). */
export function gradeWords(grade: string | undefined): string {
  const g = (grade ?? "").trim();
  return g ? `Grade ${g}` : "";
}

/** Joins the parts that exist: "Grade 3 · 2 goals", or just "2 goals" with no grade. */
export function metaLine(...parts: string[]): string {
  return parts.filter((p) => p !== "").join(" · ");
}
