import { LreForm } from "../placementForms.tsx";

export const section = "lre";

export function Form({ studentId }: { studentId: string }) {
  return <LreForm studentId={studentId} />;
}
