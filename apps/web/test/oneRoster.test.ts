import { describe, expect, it } from "vitest";
import { detectMapping, parseCsv, planImport } from "../src/data/csv.ts";
import { isOneRosterUsers, oneRosterNote, readOneRosterUsers } from "../src/data/oneRoster.ts";

// A made-up OneRoster 1.1 users.csv. The ids, emails and other columns are invented and are
// dropped by the reader.
export const USERS = [
  "sourcedId,status,dateLastModified,enabledUser,orgSourcedIds,role,username,userIds,givenName,familyName,middleName,identifier,email,sms,phone,agentSourcedIds,grades,password",
  "u-1,active,2026-08-01T00:00:00Z,true,o-1,student,avery.e,,Avery,Examplewood,,s-100,avery@example.org,,,,03,",
  "u-2,active,2026-08-01T00:00:00Z,true,o-1,teacher,t.sample,,Sam,Sampleton,,t-1,sam@example.org,,,,,",
  "u-3,tobedeleted,2026-08-01T00:00:00Z,true,o-1,student,blake.s,,Blake,Samplefield,,s-101,,,,,KG,",
  "u-4,active,2026-08-01T00:00:00Z,false,o-1,student,casey.t,,Casey,Teststone,,s-102,,,,,05,",
  'u-5,active,2026-08-01T00:00:00Z,true,o-1,Student,devon.m,,Devon,Mockridge,,s-103,,,,,"07,08",',
  "u-6,active,2026-08-01T00:00:00Z,true,o-1,student,ivy.a,,Ivy,Applecrest,,s-104,,,,,13,",
  "u-7,active,2026-08-01T00:00:00Z,true,o-1,student,noa.b,,Noa,Brook,,s-105,,,,,KG,",
  "",
].join("\n");

const table = (text: string) => {
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.message);
  return r.table;
};

describe("OneRoster users file", () => {
  it("is recognised by its headers and not by an ordinary roster", () => {
    expect(isOneRosterUsers(table(USERS).headers)).toBe(true);
    expect(isOneRosterUsers(["First", "Last", "Grade"])).toBe(false);
    expect(isOneRosterUsers(["sourcedId", "givenName", "familyName"])).toBe(false);
  });

  it("keeps only the names and first grade of active students", () => {
    const read = readOneRosterUsers(table(USERS));
    expect(read.table.headers).toEqual(["First name", "Last name", "Grade"]);
    expect(read.table.rows).toEqual([
      ["Avery", "Examplewood", "03"],
      ["Devon", "Mockridge", "07"],
      ["Ivy", "Applecrest", "13"],
      ["Noa", "Brook", "KG"],
    ]);
    expect(read).toMatchObject({ students: 4, notStudents: 1, removed: 2 });
    // Nothing else from the file survives: no ids, emails or usernames.
    expect(JSON.stringify(read)).not.toMatch(/example\.org|u-\d|s-\d|avery\.e/);
  });

  it("keeps the line each student came from", () => {
    expect(readOneRosterUsers(table(USERS)).table.lines).toEqual([2, 6, 7, 8]);
  });

  it("feeds the ordinary import: grades map, an unmappable grade is a row to fix", () => {
    const t = readOneRosterUsers(table(USERS)).table;
    const plan = planImport(t, detectMapping(t.headers), []);
    expect(plan.map((r) => [r.firstName, r.grade, r.status.kind])).toEqual([
      ["Avery", "3", "ready"],
      ["Devon", "7", "ready"],
      ["Ivy", "13", "problem"],
      ["Noa", "K", "ready"],
    ]);
  });

  it("says in one sentence what was read and left out", () => {
    expect(oneRosterNote(readOneRosterUsers(table(USERS)))).toBe(
      "Read as a OneRoster users file: 4 students. Left out: 1 other person and 2 marked deleted or disabled. Only names and grades are used.",
    );
    const none = readOneRosterUsers(table(USERS.split("\n").slice(0, 2).join("\n")));
    expect(oneRosterNote(none)).toBe(
      "Read as a OneRoster users file: 1 student. Only names and grades are used.",
    );
  });
});
