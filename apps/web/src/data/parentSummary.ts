import type { GoalArea } from "@synthetic/src/types.ts";
import type { GoalView } from "./district.ts";
import { type Period, firstNameOf, goalKit } from "./reports.ts";

// The family summary: plain words for each goal, the numbers behind it and what comes next. The
// teacher reads and approves it before it is copied or printed. The Spanish side is a fixed set of
// phrases that a bilingual reviewer checks, never a machine translation, and the goal wording the
// teacher wrote stays as written. Only the first name is used. Made-up data, nothing is sent.

export type Lang = "en" | "es";

interface Phrases {
  title: (name: string) => string;
  period: (label: string) => string;
  area: Record<GoalArea, string>;
  noData: string;
  progress: (sessions: number, start: string, now: string, aim: string) => string;
  onTrack: string;
  notYet: string;
  goalWording: string;
  notTranslated: string;
  next: string;
}

const PHRASES: Record<Lang, Phrases> = {
  en: {
    title: (n) => `How ${n} is doing on IEP goals`,
    period: (l) => `Report period: ${l}`,
    area: {
      reading: "Reading",
      written_expression: "Writing",
      math: "Math",
      communication: "Communication",
      social_emotional: "Social and emotional skills",
      behavior: "Behavior",
      adaptive: "Daily living skills",
      motor: "Movement skills",
      transition: "Planning for after school",
      other: "Other goal",
    },
    noData: "No progress was recorded in this period.",
    progress: (n, a, b, c) =>
      `${n} ${n === 1 ? "session" : "sessions"} recorded. Started at ${a}, most recent ${b}, aim ${c}.`,
    onTrack: "On track to meet this goal.",
    notYet: "Not yet on track. The team will talk about changes to help.",
    goalWording: "Goal",
    notTranslated: "",
    next: "Questions? Please contact your child's case manager.",
  },
  es: {
    title: (n) => `Cómo va ${n} con las metas del IEP`,
    period: (l) => `Período del informe: ${l}`,
    area: {
      reading: "Lectura",
      written_expression: "Escritura",
      math: "Matemáticas",
      communication: "Comunicación",
      social_emotional: "Habilidades sociales y emocionales",
      behavior: "Conducta",
      adaptive: "Habilidades de la vida diaria",
      motor: "Habilidades motoras",
      transition: "Planes para después de la escuela",
      other: "Otra meta",
    },
    noData: "No se registró progreso en este período.",
    progress: (n, a, b, c) =>
      `${n} ${n === 1 ? "sesión registrada" : "sesiones registradas"}. Comenzó en ${a}, más reciente ${b}, meta ${c}.`,
    onTrack: "Va por buen camino para lograr esta meta.",
    notYet: "Todavía no va por buen camino. El equipo hablará de cambios para ayudar.",
    goalWording: "Meta",
    notTranslated: "(Texto de la meta en inglés, tal como lo escribió el maestro.)",
    next: "¿Preguntas? Comuníquese con el encargado de caso de su hijo o hija.",
  },
};

export interface SummaryGoal {
  area: string;
  goalWording: string;
  statement: string;
  progress: string;
  status: string;
  note: string;
}

export interface FamilySummary {
  lang: Lang;
  title: string;
  period: string;
  goals: SummaryGoal[];
  next: string;
}

const round = (n: number) => String(Math.round(n * 10) / 10);

/** The summary for one student and report period, in English or Spanish. */
export function familySummary(
  student: Parameters<typeof firstNameOf>[0],
  goals: GoalView[],
  period: Period,
  lang: Lang,
): FamilySummary {
  const p = PHRASES[lang];
  return {
    lang,
    title: p.title(firstNameOf(student)),
    period: p.period(period.label),
    goals: goals.map((g) => {
      const k = goalKit(g, period);
      const status = k.computed === null ? p.noData : k.computed ? p.onTrack : p.notYet;
      return {
        area: p.area[g.goal.area],
        goalWording: p.goalWording,
        statement: g.goal.statement,
        progress:
          k.sessions === 0
            ? ""
            : p.progress(
                k.sessions,
                `${round(k.baseline ?? 0)}${k.unit}`,
                `${round(k.latest ?? 0)}${k.unit}`,
                `${round(k.aim)}${k.unit}`,
              ),
        status,
        note: p.notTranslated,
      };
    }),
    next: p.next,
  };
}

/** Plain text for copying, with no ids and only the student's first name. */
export function summaryText(s: FamilySummary): string {
  const lines = [s.title, s.period, ""];
  for (const g of s.goals) {
    lines.push(g.area, `${g.goalWording}: ${g.statement}`);
    if (g.note) lines.push(g.note);
    if (g.progress) lines.push(g.progress);
    lines.push(g.status, "");
  }
  lines.push(s.next);
  return lines.join("\n");
}
