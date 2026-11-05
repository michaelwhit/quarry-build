/**
 * The words on the plain-language pages (Help, Accessibility, the first-run tour), kept in one
 * table so a second language is a new entry, not an edit to three screens. Only English exists.
 * No Spanish is written here: it is added after a bilingual reader has seen the English as final
 * (see the Spanish reviewer plan). The two "placeholder" lines stay marked until the first-day
 * guide settles.
 */
export type PageLang = "en";

export interface TourStep {
  title: string;
  text: string;
  href: string;
}

export interface PageText {
  help: {
    title: string;
    doesTitle: string;
    does: readonly string[];
    doesNotTitle: string;
    doesNot: readonly string[];
    askTitle: string;
    ask: string;
    placeholder: string;
  };
  accessibility: {
    title: string;
    checkedTitle: string;
    checkedIntro: string;
    checked: readonly string[];
    notCheckedTitle: string;
    notChecked: string;
    reportTitle: string;
    report: string;
    placeholder: string;
    helpLink: string;
  };
  tour: {
    title: string;
    stepOf: (n: number, total: number) => string;
    steps: readonly TourStep[];
    show: string;
    back: string;
    next: string;
    done: string;
    skip: string;
  };
}

const PLACEHOLDER =
  "Placeholder wording: this line will be replaced when the first-day guide is final.";

const en: PageText = {
  help: {
    title: "Help",
    doesTitle: "What GoalLine does",
    does: [
      "Keeps goal data in one place: tap a score during a session and see the graph.",
      "Drafts goal and accommodation wording from sample libraries you can edit.",
      "Shows what is due, so reports and meetings are not missed.",
      "Shows each person only the screens that fit their role.",
    ],
    doesNotTitle: "What it does not do",
    doesNot: [
      "It does not file anything in SRS. SRS stays the official record.",
      "It does not send reports, notices or messages to anyone for you.",
      "It does not decide anything for the IEP team. You and the team decide.",
    ],
    askTitle: "Who to ask",
    ask: "Ask your case manager first. If they cannot help, ask the director.",
    placeholder: PLACEHOLDER,
  },
  accessibility: {
    title: "Accessibility",
    checkedTitle: "What is checked",
    checkedIntro:
      "These are checked by automated tests each time the app changes. They are not a full audit.",
    checked: [
      "You can reach every screen with the keyboard, and Skip to content is the first stop.",
      "Moving to another tab puts focus on that screen's heading and names the page.",
      "Every button and field has a name a screen reader can read.",
      "The tab you are on is marked as current, and saving a session is announced.",
      "On a phone, and with larger text, the page does not scroll sideways or hide behind the tab bar.",
      "The same holds at common desktop widths.",
    ],
    notCheckedTitle: "What is not checked",
    notChecked:
      "Not every screen has been tried with every screen reader, and color contrast has not been audited by a specialist. If something does not work for you, please say so.",
    reportTitle: "Report a problem",
    report: "Tell your case manager first, then the director.",
    placeholder: PLACEHOLDER,
    helpLink: "Help",
  },
  tour: {
    title: "A quick look around",
    stepOf: (n, total) => `Step ${n} of ${total}`,
    steps: [
      {
        title: "Today",
        text: "Today lists the goals to work on and the sessions to run. Start a session from here.",
        href: "#/today",
      },
      {
        title: "Record data",
        text: "Pick a student and a goal, tap a score for each try, and save. The graph updates right away.",
        href: "#/track",
      },
      {
        title: "Caseload",
        text: "Caseload shows each student, their goals and whether they are on track.",
        href: "#/caseload",
      },
      {
        title: "Libraries",
        text: "Libraries holds sample goal and accommodation wording you can edit and add to a student.",
        href: "#/libraries",
      },
    ],
    show: "Show me",
    back: "Back",
    next: "Next",
    done: "Done",
    skip: "Skip the tour",
  },
};

/** Every language has the whole table or it is not listed: a missing line never shows blank. */
export const PAGE_TEXT: Record<PageLang, PageText> = { en };

export const pageText = (lang: PageLang = "en"): PageText => PAGE_TEXT[lang] ?? en;
