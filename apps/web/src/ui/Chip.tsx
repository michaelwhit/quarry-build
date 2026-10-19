import { type GoalStatus, STATUS_LABEL } from "../data/derive.ts";

// Color is never the only signal: every status has a symbol and a word.
const SYMBOL: Record<GoalStatus, string> = {
  met: "★",
  on_track: "▲",
  needs_attention: "!",
  no_data: "–",
};

export function Chip({ status }: { status: GoalStatus }) {
  return (
    <span className={`chip ${status}`}>
      <span aria-hidden="true">{SYMBOL[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
