import { HealthPeForm } from "../placementForms.tsx";

export const section = "health_pe";

export function Form({ studentId }: { studentId: string }) {
  return <HealthPeForm studentId={studentId} />;
}
