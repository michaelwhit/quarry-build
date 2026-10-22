import { getPlacement, getPlacementVersion, subscribePlacement } from "../placement.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "transportation";
export const subscribe = subscribePlacement;
export const version = getPlacementVersion;

export const items: Builder = (studentId) => {
  const t = getPlacement(studentId).transport;
  const label = "Child qualifies for special education transportation";
  if (t === null) return [{ id: "transport.answer", label, blocked: "Choose Yes or No." }];
  return [{ id: "transport.answer", label, pick: t === "yes" ? "Yes" : "No" }];
};
