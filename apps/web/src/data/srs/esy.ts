import { scrub, studentById } from "../district.ts";
import { getIepShort, getIepShortVersion, subscribeIepShort } from "../iepShort.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "esy";
export const subscribe = subscribeIepShort;
export const version = getIepShortVersion;

/** The district's own standard sentence is to be confirmed inside SRS; this is the placeholder. */
export const ESY_NOT_NEEDED =
  "This was considered by the IEP team, but was deemed unnecessary at the time.";

export const items: Builder = (studentId) => {
  const id = "esy.box";
  const label = "Extended school year";
  const e = getIepShort(studentId).esy;
  if (!e)
    return [{ id, label, blocked: "Choose whether the team found it not needed, or needed." }];
  const view = studentById(studentId);
  const t = (view ? scrub(e.text, view.student) : e.text).trim();
  if (e.choice === "needed")
    return [t ? { id, label, text: t } : { id, label, blocked: "Describe the services." }];
  return [{ id, label, text: t ? `${ESY_NOT_NEEDED} ${t}` : ESY_NOT_NEEDED }];
};
