import { boxItem } from "../placementItems.ts";
import { getPlacement, getPlacementVersion, subscribePlacement } from "../placement.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "health_pe";
export const subscribe = subscribePlacement;
export const version = getPlacementVersion;

export const PE_CONFIRM = "confirm you addressed the student's needs in Physical Education";

export const items: Builder = (studentId) => {
  const p = getPlacement(studentId);
  return [
    boxItem("health.text", "Health and self-care needs", p.health, studentId),
    boxItem("pe.text", "Physical Education", p.pe, studentId),
    { id: "pe.confirm", label: "Physical Education check box", pick: `Tick in SRS: ${PE_CONFIRM}` },
  ];
};
