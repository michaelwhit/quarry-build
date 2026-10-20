import { useState } from "react";
import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import { displayName, goalById, studentById } from "../data/district.ts";
import {
  addGoal,
  addStudent,
  deleteGoal,
  deleteStudent,
  updateGoal,
  updateStudent,
} from "../data/workspace.ts";

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

/** A two-step delete button: the first press asks, the second does it. */
export function DeleteButton({
  label,
  ask,
  onDelete,
}: {
  label: string;
  ask: string;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="actions">
      <button type="button" className="danger" onClick={onDelete}>
        {ask}
      </button>
      <button type="button" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </div>
  ) : (
    <button type="button" className="danger-ghost" onClick={() => setArmed(true)}>
      {label}
    </button>
  );
}

export function AddStudent({ editId }: { editId?: string }) {
  const existing = editId ? studentById(editId)?.student : undefined;
  const [first, setFirst] = useState(existing?.first_name ?? "");
  const [last, setLast] = useState(existing?.last_name ?? "");
  const [preferred, setPreferred] = useState(existing?.preferred_name ?? "");
  const [grade, setGrade] = useState(existing?.grade ?? "3");
  const [error, setError] = useState("");
  if (editId && !existing)
    return (
      <p>
        Student not found. <a href="#/caseload">Back to caseload</a>
      </p>
    );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const input = { firstName: first, lastName: last, preferredName: preferred, grade };
      if (editId) {
        updateStudent(editId, input);
        window.location.hash = `#/student/${editId}`;
      } else {
        window.location.hash = `#/student/${addStudent(input)}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the student");
    }
  };
  return (
    <>
      <a className="btn back" href={editId ? `#/student/${editId}` : "#/caseload"}>
        ← {editId ? "Back" : "Caseload"}
      </a>
      <h2 className="page-title">{editId ? "Edit student" : "Add a student"}</h2>
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
          {editId ? "Save changes" : "Add student"}
        </button>
      </form>
      {editId && (
        <DeleteButton
          label="Delete this student"
          ask="Yes, delete the student and all their goals and data"
          onDelete={() => {
            deleteStudent(editId);
            window.location.hash = "#/caseload";
          }}
        />
      )}
    </>
  );
}

export function AddGoal({ studentId, editGoalId }: { studentId: string; editGoalId?: string }) {
  const s = studentById(studentId);
  const old = editGoalId ? goalById(studentId, editGoalId)?.g : undefined;
  const editing = old !== undefined;
  const [area, setArea] = useState<GoalArea>(old?.goal.area ?? "reading");
  const [statement, setStatement] = useState(old?.goal.statement ?? "");
  const [baseline, setBaseline] = useState(old?.goal.baseline ?? "");
  const [criteria, setCriteria] = useState(old?.goal.criteria ?? "");
  const [type, setType] = useState<MeasurementType>(old?.plan.type ?? "percent_correct");
  const [unit, setUnit] = useState(old ? (old.plan.unit ?? "") : "percent");
  const [target, setTarget] = useState(old ? String(old.plan.target_value) : "80");
  const [trials, setTrials] = useState(String(old?.plan.trials_per_session ?? 10));
  const [levels, setLevels] = useState((old?.plan.prompt_hierarchy ?? DEFAULT_LEVELS).join("\n"));
  const [steps, setSteps] = useState((old?.plan.task_steps ?? []).join("\n"));
  const [frequency, setFrequency] = useState(old?.plan.frequency ?? "2x weekly");
  const [error, setError] = useState("");

  if (!s || (editGoalId && !old))
    return (
      <p>
        Not found. <a href="#/caseload">Back to caseload</a>
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
      if (editGoalId) {
        updateGoal(editGoalId, {
          area,
          statement,
          baseline,
          criteria,
          unit:
            type === "prompt_level" || type === "task_analysis" || type === "yes_no" ? "" : unit,
          targetValue,
          trialsPerSession: type === "trials" ? Number(trials) : null,
          frequency,
        });
        window.location.hash = `#/student/${s.student.id}`;
        return;
      }
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
      <h2 className="page-title">{editing ? "Edit goal" : "Add a goal"}</h2>
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
          <select
            value={type}
            disabled={editing}
            onChange={(e) => pickType(e.target.value as MeasurementType)}
          >
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
              readOnly={editing}
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
            <textarea
              value={steps}
              rows={5}
              readOnly={editing}
              onChange={(e) => setSteps(e.target.value)}
            />
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
            {[...new Set(["daily", "3x weekly", "2x weekly", "weekly", "monthly", frequency])].map(
              (f) => (
                <option key={f}>{f}</option>
              ),
            )}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="save">
          {editing ? "Save changes" : "Add goal"}
        </button>
      </form>
      {editGoalId && (
        <DeleteButton
          label="Delete this goal"
          ask="Yes, delete the goal and its data"
          onDelete={() => {
            deleteGoal(editGoalId);
            window.location.hash = `#/student/${s.student.id}`;
          }}
        />
      )}
    </>
  );
}
