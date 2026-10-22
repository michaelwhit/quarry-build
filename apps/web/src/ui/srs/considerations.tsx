import { Considerations } from "../Considerations.tsx";

export const section = "considerations";

export function Form({ studentId }: { studentId: string }) {
  return (
    <>
      <p>
        <a href={`#/student/${studentId}/present-levels`}>Write present levels</a>
      </p>
      <Considerations studentId={studentId} />
    </>
  );
}
