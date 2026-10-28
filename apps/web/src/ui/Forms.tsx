import { useState } from "react";
import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import { clip } from "../data/codePoints.ts";
import { displayName, goalById, studentById, students } from "../data/district.ts";
import {
  FIELDS,
  MAX_FILE_BYTES,
  type Mapping,
  type PlannedRow,
  type CsvTable,
  detectMapping,
  isComplete,
  parseCsv,
  planImport,
  readyRows,
} from "../data/csv.ts";
import { EXAMPLE_FILE, EXAMPLE_FILE_NAME } from "../data/importExample.ts";
import { sampleLine } from "../data/importGuide.ts";
import {
  addGoal,
  addStudent,
  addStudents,
  deleteGoal,
  deleteStudent,
  updateGoal,
  updateStudent,
} from "../data/workspace.ts";
import { gradeBandOf } from "../data/libraryFill.ts";
import { MAX_MY_GOALS, addMyGoal, getMyGoals, removeMyGoal } from "../data/myItems.ts";
import { type GoalForTemplate, draftMyGoal, todayIso } from "../data/myItemsFromGoal.ts";
import { MyItemsOffer } from "./MyItemsOffer.tsx";

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
          <input value={first} required onChange={(e) => setFirst(clip(e.target.value, 40))} />
        </label>
        <label>
          <span>Last name</span>
          <input value={last} required onChange={(e) => setLast(clip(e.target.value, 40))} />
        </label>
        <label>
          <span>Preferred name (optional)</span>
          <input value={preferred} onChange={(e) => setPreferred(clip(e.target.value, 40))} />
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
  const [saveMine, setSaveMine] = useState(false);
  const [mineTitle, setMineTitle] = useState("");
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
  const unitUsed =
    type === "prompt_level" || type === "task_analysis" || type === "yes_no" ? "" : unit;
  const forMine = (): GoalForTemplate => ({
    title: mineTitle,
    statement,
    criteria,
    area,
    type,
    unit: unitUsed,
    targetValue: type === "task_analysis" && target === "" ? stepList.length : Number(target),
    trialsPerSession: type === "trials" ? Number(trials) : null,
    promptHierarchy: type === "prompt_level" ? levelList : [],
    taskSteps: type === "task_analysis" ? stepList : [],
    names: [s.student.first_name, s.student.last_name, s.student.preferred_name ?? ""],
    gradeBand: gradeBandOf(s.student.grade),
  });
  /** Saves to My items first, so a duplicate or an unsaved item stops the form before the goal is added. */
  const saveToMine = (): string | null => {
    if (!saveMine) return null;
    if (getMyGoals().length >= MAX_MY_GOALS)
      throw new Error("My items is full. Remove one in Libraries, or untick the box.");
    const r = addMyGoal(draftMyGoal(forMine(), todayIso()).item);
    if (!r.ok)
      throw new Error(
        r.reason === "duplicate"
          ? "That wording is already in My items. Untick the box to save the goal."
          : "This goal is too long to keep in My items. Untick the box to save the goal alone.",
      );
    if (!r.kept) {
      removeMyGoal(r.id);
      throw new Error(
        "This browser would not keep My items for later visits. Untick the box to save the goal alone.",
      );
    }
    return r.id;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let mineId: string | null = null;
    try {
      const targetValue =
        type === "task_analysis" && target === "" ? stepList.length : Number(target);
      if (type === "prompt_level" && levelList.length < 2)
        throw new Error("Add at least two levels");
      if (type === "task_analysis" && stepList.length < 1) throw new Error("Add the steps");
      if (type === "trials" && !(Number(trials) > 0))
        throw new Error("Enter the trials per session");
      mineId = saveToMine();
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
      if (mineId) removeMyGoal(mineId);
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
            required
            onChange={(e) => setStatement(clip(e.target.value, 800))}
          />
        </label>
        <label>
          <span>Baseline (where the student is now)</span>
          <input
            value={baseline}
            required
            placeholder="e.g. 3 minutes"
            onChange={(e) => setBaseline(clip(e.target.value, 200))}
          />
        </label>
        <label>
          <span>Criteria</span>
          <input
            value={criteria}
            placeholder="e.g. in 4 of 5 sessions"
            onChange={(e) => setCriteria(clip(e.target.value, 300))}
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
            <input value={unit} onChange={(e) => setUnit(clip(e.target.value, 40))} />
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
        <MyItemsOffer
          goal={forMine()}
          on={saveMine}
          onToggle={setSaveMine}
          onTitle={setMineTitle}
        />
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

const statusText = (r: PlannedRow) =>
  r.status.kind === "ready"
    ? "Will add"
    : r.status.kind === "duplicate"
      ? "Already on the list"
      : r.status.why;

const IMPORT_STEPS = ["Choose file", "Match columns", "Review and fix", "Add"];

/** Add many students at once from a spreadsheet saved as CSV: pick the file, check the columns, preview, confirm. */
export function ImportStudents() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState("");
  const [added, setAdded] = useState<number | null>(null);

  const known = students.map((v) => ({
    firstName: v.student.first_name,
    lastName: v.student.last_name,
    grade: v.student.grade,
  }));
  const plan = table && isComplete(mapping) ? planImport(table, mapping, known) : null;
  const ready = plan ? readyRows(plan) : [];

  const load = (text: string, name: string) => {
    setError("");
    setAdded(null);
    const result = parseCsv(text);
    if (!result.ok) {
      setTable(null);
      setError(result.message);
      return;
    }
    setTable(result.table);
    setFileName(name);
    setMapping(detectMapping(result.table.headers));
  };

  const pick = (file: File | undefined) => {
    setError("");
    setAdded(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 1 MB. Check that it is the right file.");
      return;
    }
    void file
      .text()
      .then((text) => load(text, file.name))
      .catch(() => {
        setTable(null);
        setError("That file could not be read. Try saving it again as a CSV file.");
      });
  };

  const step =
    added !== null ? 4 : !table ? 1 : plan?.some((r) => r.status.kind === "problem") ? 3 : 2;

  const confirm = () => {
    setError("");
    try {
      // One save for the whole file: either every student is added or none is.
      const ids = addStudents(
        ready.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          preferredName: r.preferredName,
          grade: r.grade,
        })),
      );
      setAdded(ids.length);
    } catch {
      setError("Could not add students. Nothing was added. Try again.");
    }
  };

  return (
    <>
      <a className="btn back" href="#/caseload">
        ← Caseload
      </a>
      <h2 className="page-title">Import students</h2>
      <p className="form-warn" role="note">
        Practice only: use made-up names. Do not enter a real student.
      </p>
      <ol className="import-steps" aria-label="Steps">
        {IMPORT_STEPS.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>
      {!table && (
        <section aria-label="What the file needs">
          <p className="meta">
            Use the caseload list you export from your records system, or any spreadsheet saved as
            CSV (commas, semicolons or tabs), with one student per row. A report title above the
            column names is fine. Nothing is added until you confirm.
          </p>
          <ul className="meta">
            <li>Needed: a grade, and either a first and last name or one full-name column.</li>
            <li>Optional: a preferred name. Any other columns are ignored.</li>
            <li>
              GoalLine matches the columns for you, and you can change them before anything is
              added.
            </li>
            <li>
              The file is read in this browser only. Delete the downloaded file when you are done.
            </li>
          </ul>
        </section>
      )}
      <div className="actions">
        <label className="btn file-btn">
          {table ? "Choose a different file" : "Choose a file"}
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              pick(f);
            }}
          />
        </label>
        {!table && (
          <button type="button" onClick={() => load(EXAMPLE_FILE, EXAMPLE_FILE_NAME)}>
            Try a made-up example file
          </button>
        )}
        {fileName && <span className="meta">{fileName}</span>}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {table && (
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          {table.headerLine !== undefined && (
            <p className="meta">
              The header row is on line {table.headerLine}. The lines above it were skipped.
            </p>
          )}
          <h4 className="sec">Which column is which</h4>
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>{f.required ? f.title : `${f.title} (optional)`}</span>
              <select
                value={mapping[f.key] ?? ""}
                aria-describedby={`import-sample-${f.key}`}
                onChange={(e) => {
                  const next = { ...mapping };
                  if (e.target.value === "") delete next[f.key];
                  else next[f.key] = Number(e.target.value);
                  setMapping(next);
                  setAdded(null);
                }}
              >
                <option value="">Not in the file</option>
                {table.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
              <span className="meta" id={`import-sample-${f.key}`}>
                {sampleLine(table, mapping[f.key])}
              </span>
            </label>
          ))}
          {!isComplete(mapping) && (
            <p className="meta">
              Choose a column for grade, and either a first and a last name column or one full-name
              column.
            </p>
          )}
        </form>
      )}
      {plan && (
        <section aria-label="Preview">
          <h4 className="sec">Preview</h4>
          <p className="saved" role="status">
            {added !== null
              ? `${added} student${added === 1 ? "" : "s"} added.`
              : `${ready.length} to add, ${plan.filter((r) => r.status.kind === "duplicate").length} already on the list, ${plan.filter((r) => r.status.kind === "problem").length} to fix in the file`}
          </p>
          {added !== null && (
            <p>
              <a className="btn" href="#/caseload">
                View the caseload
              </a>
            </p>
          )}
          {added === null && (
            <ul className="import-list">
              {plan.map((r) => (
                <li key={r.line}>
                  <span>
                    {`${r.firstName} ${r.lastName}`.trim() || "(no name)"}
                    <span className="meta">
                      {" "}
                      Grade {r.grade || "?"} · line {r.line}
                    </span>
                  </span>
                  <span className={r.status.kind === "problem" ? "form-error" : "meta"}>
                    {statusText(r)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button
              type="button"
              className="save"
              onClick={confirm}
              disabled={ready.length === 0 || added !== null}
            >
              Add students
            </button>
          </div>
        </section>
      )}
    </>
  );
}
