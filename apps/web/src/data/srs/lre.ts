import { boxItem } from "../placementItems.ts";
import { getPlacement, getPlacementVersion, subscribePlacement } from "../placement.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "lre";
export const subscribe = subscribePlacement;
export const version = getPlacementVersion;

export const items: Builder = (studentId) => [
  boxItem(
    "lre.text",
    "Least restrictive environment placement",
    getPlacement(studentId).lre,
    studentId,
  ),
];
