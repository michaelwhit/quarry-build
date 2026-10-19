import { useState } from "react";
import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import { displayName, studentById } from "../data/district.ts";
import { addGoal, addStudent } from "../data/workspace.ts";

const GRADES = ["PK", "K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];

const AREAS: [GoalArea, string][] = [
  ["reading", "Reading"],
  ["written_expression", "Written expression"],
  ["math", "Math"],
  ["communication", "Communication"],
  ["social_emotional", "Social and emotional"],
  ["behavior", "Behavior"],
  ["adaptive", "Adaptive"],
  ["motor", "Motor"],
  ["transition", "Transition"],
  ["other", "Other"],
];

const TYPES: [MeasurementType, string][] = [
  ["percent_correct", "Percent correct"],
  ["trials", "Trials correct"],
  ["frequency", "Frequency count"],
  ["rate", "Rate"],
  ["duration", "Duration"],
  ["latency", "Latency"],
  ["rubric", "Rubric score"],
  ["prompt_level", "Prompt level"],
  ["task_analysis", "Task analysis (steps)"],
  ["yes_no", "Yes or no"],
];

const DEFAULT_UNIT: Partial<Record<MeasurementType, string>> = {
  percent_correct: "percent",
  frequency: "times",
  rate: "per minute",
  duration: "minutes",
  latency: "seconds",
  rubric: "rubric points",
};

const DEFAULT_LEVELS = [
  "full physical",
  "partial physical",
  "model",
  "gestural",
  "verbal",
  "independent",
];

const lines = (t: string) =>
  [
    ...new Set(
      t
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);

export function AddStudent() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [preferred, setPreferred] = useState("");
  const [grade, setGrade] = useState("3");
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = addStudent({
        firstName: first,
        lastName: last,
        preferredName: preferred,
        grade,
      });
      window.location.hash = `#/student/${id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the student");
    }
  };
  return (
    <>
      <a className="btn back" href="#/caseload">
        ← Caseload
      </a>
      <h2 className="page-title">Add a student</h2>
      <p className="form-warn" role="note">
        Practice only: use made-up names. Do not enter a real student.
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          <span>First name</span>
          <input value={first} maxLength={40} required onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label>
          <span>Last name</span>
          <input value={last} maxLength={40} required onChange={(e) => setLast(e.target.value)} />
        </label>
        <label>
          <span>Preferred name (optional)</span>
          <input value={preferred} maxLength={40} onChange={(e) => setPreferred(e.target.value)} />
        </label>
        <label>
          <span>Grade</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="save">
          Add student
        </button>
      </form>
    </>
  );
}

export function AddGoal({ studentId }: { studentId: string }) {
  const s = studentById(studentId);
  const [area, setArea] = useState<GoalArea>("reading");
  const [statement, setStatement] = useState("");
  const [baseline, setBaseline] = useState("");
  const [criteria, setCriteria] = useState("");
  const [type, setType] = useState<MeasurementType>("percent_correct");
  const [unit, setUnit] = useState("percent");
  const [target, setTarget] = useState("80");
  const [trials, setTrials] = useState("10");
  const [levels, setLevels] = useState(DEFAULT_LEVELS.join("\n"));
  const [steps, setSteps] = useState("");
  const [frequency, setFrequency] = useState("2x weekly");
  const [error, setError] = useState("");

  if (!s)
    return (
      <p>
        Student not found. <a href="#/caseload">Back to caseload</a>
      </p>
    );

  const pickType = (t: MeasurementType) => {
    setType(t);
    setUnit(DEFAULT_UNIT[t] ?? "");
    setTarget(t === "percent_correct" ? "80" : t === "yes_no" ? "1" : "");
  };
  const levelList = lines(levels);
  const stepList = lines(steps);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetValue =
        type === "task_analysis" && target === "" ? stepList.length : Number(target);
      if (type === "prompt_level" && levelList.length < 2)
        throw new Error("Add at least two levels");
      if (type === "task_analysis" && stepList.length < 1) throw new Error("Add the steps");
      if (type === "trials" && !(Number(trials) > 0))
        throw new Error("Enter the trials per session");
      addGoal(s.student.id, {
        area,
        statement,
        baseline,
        criteria,
        type,
        unit: type === "prompt_level" || type === "task_analysis" || type === "yes_no" ? "" : unit,
        targetValue,
        trialsPerSession: type === "trials" ? Number(trials) : null,
        promptHierarchy: type === "prompt_level" ? levelList : [],
        taskSteps: type === "task_analysis" ? stepList : [],
        frequency,
      });
      window.location.hash = `#/student/${s.student.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the goal");
    }
  };

  return (
    <>
      <a className="btn back" href={`#/student/${s.student.id}`}>
        ← {displayName(s.student)}
      </a>
      <h2 className="page-title">Add a goal</h2>
      <p className="form-warn" role="note">
        Practice only: write a made-up goal.
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          <span>Area</span>
          <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)}>
            {AREAS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Whole goal</span>
          <textarea
            value={statement}
            rows={4}
            maxLength={800}
            required
            onChange={(e) => setStatement(e.target.value)}
          />
        </label>
        <label>
          <span>Baseline (where the student is now)</span>
          <input
            value={baseline}
            maxLength={200}
            required
            placeholder="e.g. 3 minutes"
            onChange={(e) => setBaseline(e.target.value)}
          />
        </label>
        <label>
          <span>Criteria</span>
          <input
            value={criteria}
            maxLength={300}
            placeholder="e.g. in 4 of 5 sessions"
            onChange={(e) => setCriteria(e.target.value)}
          />
        </label>
        <label>
          <span>How it is measured</span>
          <select value={type} onChange={(e) => pickType(e.target.value as MeasurementType)}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {type === "trials" && (
          <label>
            <span>Trials per session</span>
            <input
              type="number"
              min={1}
              max={100}
              value={trials}
              onChange={(e) => setTrials(e.target.value)}
            />
          </label>
        )}
        {type === "prompt_level" && (
          <label>
            <span>Prompt levels, most support first (one per line)</span>
            <textarea
              value={levels}
              rows={6}
              onChange={(e) => {
                setLevels(e.target.value);
                setTarget("");
              }}
            />
          </label>
        )}
        {type === "task_analysis" && (
          <label>
            <span>Steps (one per line)</span>
            <textarea value={steps} rows={5} onChange={(e) => setSteps(e.target.value)} />
          </label>
        )}
        {type !== "yes_no" && type !== "prompt_level" && type !== "task_analysis" && (
          <label>
            <span>Unit</span>
            <input value={unit} maxLength={40} onChange={(e) => setUnit(e.target.value)} />
          </label>
        )}
        {type === "prompt_level" ? (
          <label>
            <span>Target level</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">Choose…</option>
              {levelList.map((l, i) => (
                <option key={i} value={i + 1}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ) : type === "yes_no" ? null : (
          <label>
            <span>
              {type === "rubric" ? "Highest rubric score" : "Target"}
              {type === "task_analysis" ? " (steps done; blank means all)" : ""}
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={target}
              required={type !== "task_analysis"}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        )}
        <label>
          <span>How often</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {["daily", "3x weekly", "2x weekly", "weekly", "monthly"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="save">
          Add goal
        </button>
      </form>
    </>
  );
}
