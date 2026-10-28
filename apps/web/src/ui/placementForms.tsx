import { clip } from "../data/codePoints.ts";
import { getPlacement, setPlacement, MAX_TEXT, type Placement } from "../data/placement.ts";

type BoxKey = "lre" | "health" | "pe";

function Box({ studentId, field, label }: { studentId: string; field: BoxKey; label: string }) {
  const p: Placement = getPlacement(studentId);
  return (
    <label>
      {label}
      <textarea
        rows={4}
        value={p[field]}
        onChange={(e) => setPlacement(studentId, { [field]: clip(e.target.value, MAX_TEXT) })}
      />
    </label>
  );
}

/** The least restrictive environment box. */
export function LreForm({ studentId }: { studentId: string }) {
  return (
    <details>
      <summary>Write the placement</summary>
      <Box studentId={studentId} field="lre" label="Least restrictive environment placement" />
    </details>
  );
}

/** The health and Physical Education boxes. */
export function HealthPeForm({ studentId }: { studentId: string }) {
  return (
    <details>
      <summary>Write health and Physical Education</summary>
      <Box studentId={studentId} field="health" label="Health and self-care needs" />
      <Box studentId={studentId} field="pe" label="Physical Education" />
    </details>
  );
}

/** The transportation answer. */
export function TransportationForm({ studentId }: { studentId: string }) {
  const t = getPlacement(studentId).transport;
  return (
    <fieldset>
      <legend>Child qualifies for special education transportation</legend>
      {(["yes", "no"] as const).map((v) => (
        <label className="check" key={v}>
          <input
            type="radio"
            name="transport"
            checked={t === v}
            onChange={() => setPlacement(studentId, { transport: v })}
          />
          {v === "yes" ? "Yes" : "No"}
        </label>
      ))}
    </fieldset>
  );
}
