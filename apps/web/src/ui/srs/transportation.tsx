import { TransportationForm } from "../placementForms.tsx";

export const section = "transportation";

export function Form({ studentId }: { studentId: string }) {
  return <TransportationForm studentId={studentId} />;
}
