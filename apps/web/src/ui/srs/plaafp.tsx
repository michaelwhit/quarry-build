export const section = "plaafp";

export function Form({ studentId }: { studentId: string }) {
  return (
    <p>
      <a href={`#/student/${studentId}/present-levels`}>Write present levels</a>
    </p>
  );
}
