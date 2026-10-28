import { useState, useId } from "react";
import {
  ACTIVITY_TEXT,
  type ConsentActivity,
  type Contact,
  type MeetingPurpose,
  type NoticeDraft,
  PURPOSE_TEXT,
  draftConsent,
  draftInvite,
  draftTimeline,
  noticeCopy,
  timelineText,
} from "../data/meetingNotices.ts";
import { POSITIONS } from "../data/iepShort.ts";
import { type RoleId, can, getRole } from "../data/roles.ts";

// The meeting notices screen (practice data only): the invitation, the consent request and the
// evaluation timeline, drafted by code from what the teacher types here. Nothing is saved or sent;
// the teacher reads each box, ticks it as read, and copies it into the record system by hand.

// Same people who may start an evaluation: the director and case managers.
export const canUseNotices = (role: RoleId | null) => can(role, "evaluation");

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

type Tab = "invite" | "consent" | "timeline";
const TABS: { id: Tab; label: string }[] = [
  { id: "invite", label: "Meeting invitation" },
  { id: "consent", label: "Consent request" },
  { id: "timeline", label: "Evaluation timeline" },
];

/** Tick and Copy for one box of text. A change to the text takes the tick away. */
export function TickCopy({ label, text }: { label: string; text: string }) {
  const id = useId();
  const [read, setRead] = useState("");
  // The message belongs to the text it was about; once the text changes it goes away.
  const [done, setDone] = useState({ text: "", message: "" });
  const ticked = read === text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone({ text, message: `Copied ${label}` });
    } catch {
      setDone({ text, message: "Could not copy. Select the text and copy it yourself." });
    }
  };
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => setRead(e.target.checked ? text : "")}
        />
        I read this and it is right
      </label>{" "}
      <button
        type="button"
        className="btn"
        disabled={!ticked}
        aria-describedby={ticked ? undefined : `${id}-tick-hint`}
        onClick={copy}
      >
        Copy {label}
      </button>
      {!ticked && (
        <p id={`${id}-tick-hint`} className="meta">
          Tick the box to turn Copy on.
        </p>
      )}
      <p className="saved" role="status">
        {done.text === text ? done.message : ""}
      </p>
    </>
  );
}

/** Each approved box can be copied only after it is ticked as read. */
function Boxes({ draft }: { draft: NoticeDraft }) {
  return (
    <>
      {draft.boxes.map((b) => {
        const text = noticeCopy(draft, b.id);
        return (
          <section className="goal" key={b.id} aria-label={b.label}>
            <h3>{b.label}</h3>
            {b.text && <p style={{ whiteSpace: "pre-wrap" }}>{b.text}</p>}
            {b.blocked.map((why) => (
              <p key={why} role="note" className="empty">
                {why}
              </p>
            ))}
            {text !== null && <TickCopy label={b.label} text={text} />}
          </section>
        );
      })}
    </>
  );
}

function ContactFields({ value, onChange }: { value: Contact; onChange: (c: Contact) => void }) {
  return (
    <fieldset>
      <legend>Contact for questions</legend>
      <label>
        Name
        <input
          maxLength={120}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <label>
        Role
        <input
          maxLength={120}
          value={value.role}
          onChange={(e) => onChange({ ...value, role: e.target.value })}
        />
      </label>
      <label>
        Phone (optional)
        <input
          maxLength={40}
          value={value.phone ?? ""}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </label>
    </fieldset>
  );
}

function Invite({ contact, setContact }: { contact: Contact; setContact: (c: Contact) => void }) {
  const [purpose, setPurpose] = useState<MeetingPurpose>("annual_review");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [people, setPeople] = useState([{ name: "", position: "" }]);
  const draft = draftInvite({
    purpose,
    meetingDate: date,
    meetingTime: time,
    location: place,
    invitees: people,
    contact,
  });
  const set = (i: number, p: Partial<(typeof people)[number]>) =>
    setPeople(people.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <>
      <label>
        Purpose
        <select value={purpose} onChange={(e) => setPurpose(e.target.value as MeetingPurpose)}>
          {(Object.keys(PURPOSE_TEXT) as MeetingPurpose[]).map((k) => (
            <option key={k} value={k}>
              {PURPOSE_TEXT[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Meeting date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Time
        <input
          maxLength={40}
          placeholder="9:30 AM"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <label>
        Place
        <input maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
      </label>
      {people.map((p, i) => (
        <fieldset key={i}>
          <legend>Person invited {i + 1}</legend>
          <label>
            Name
            <input
              maxLength={120}
              value={p.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
          </label>
          <label>
            Position
            <select value={p.position} onChange={(e) => set(i, { position: e.target.value })}>
              <option value="">Choose…</option>
              {POSITIONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {people.length > 1 && (
            <button
              type="button"
              className="btn"
              onClick={() => setPeople(people.filter((_, j) => j !== i))}
            >
              Remove person {i + 1}
            </button>
          )}
        </fieldset>
      ))}
      {people.length < 20 && (
        <button
          type="button"
          className="btn"
          onClick={() => setPeople([...people, { name: "", position: "" }])}
        >
          Add a person
        </button>
      )}
      <ContactFields value={contact} onChange={setContact} />
      <Boxes draft={draft} />
    </>
  );
}

function Consent({ contact, setContact }: { contact: Contact; setContact: (c: Contact) => void }) {
  const [activity, setActivity] = useState<ConsentActivity>("initial_evaluation");
  const [areas, setAreas] = useState("");
  const [instruments, setInstruments] = useState("");
  const [reason, setReason] = useState("");
  const draft = draftConsent({
    activity,
    areas: lines(areas),
    instruments: lines(instruments),
    reason,
    contact,
  });
  return (
    <>
      <label>
        Asking consent for
        <select value={activity} onChange={(e) => setActivity(e.target.value as ConsentActivity)}>
          {(Object.keys(ACTIVITY_TEXT) as ConsentActivity[]).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_TEXT[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Areas to look at (one per line)
        <textarea
          rows={3}
          maxLength={1000}
          value={areas}
          onChange={(e) => setAreas(e.target.value)}
        />
      </label>
      <label>
        Procedures and instruments (one per line, optional)
        <textarea
          rows={3}
          maxLength={1000}
          value={instruments}
          onChange={(e) => setInstruments(e.target.value)}
        />
      </label>
      <label>
        Why, in your own words
        <textarea
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <ContactFields value={contact} onChange={setContact} />
      <Boxes draft={draft} />
    </>
  );
}

function Timeline() {
  const [consent, setConsent] = useState("");
  const [days, setDays] = useState("");
  const [off, setOff] = useState("");
  const [meet, setMeet] = useState("");
  const draft = draftTimeline({
    consentDate: consent,
    schoolDaysAllowed: Number(days),
    noSchoolDays: lines(off),
    ...(meet.trim() === "" ? {} : { meetingWithinDays: Number(meet) }),
  });
  const text = timelineText(draft);
  return (
    <>
      <label>
        Date consent was received
        <input type="date" value={consent} onChange={(e) => setConsent(e.target.value)} />
      </label>
      <label>
        School days allowed (the district sets this number)
        <input
          inputMode="numeric"
          maxLength={3}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      <label>
        Days from the report to the meeting (optional)
        <input
          inputMode="numeric"
          maxLength={3}
          value={meet}
          onChange={(e) => setMeet(e.target.value)}
        />
      </label>
      <label>
        No-school days, YYYY-MM-DD, one per line (weekends are skipped for you)
        <textarea rows={4} maxLength={2000} value={off} onChange={(e) => setOff(e.target.value)} />
      </label>
      <section className="goal" aria-label="Timeline">
        <h3>Evaluation timeline</h3>
        {draft.blocked.map((why) => (
          <p key={why} role="note" className="empty">
            {why}
          </p>
        ))}
        {text !== null && (
          <>
            <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
            <TickCopy label="the timeline" text={text} />
          </>
        )}
      </section>
    </>
  );
}

export function MeetingNotices() {
  const [tab, setTab] = useState<Tab>("invite");
  const [contact, setContact] = useState<Contact>({ name: "", role: "", phone: "" });
  if (!canUseNotices(getRole()))
    return (
      <>
        <h2 className="page-title">Not available for this role</h2>
        <p className="empty">Sign in as the director or a case manager.</p>
      </>
    );
  return (
    <>
      <h2 className="page-title">Meeting notices</h2>
      <p>
        Fill in what you know. Each box is written by the app from your entries, so read it, tick
        it, then copy it into the record system yourself. Nothing here is saved or sent anywhere.
      </p>
      <p>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </p>
      {tab === "invite" && <Invite contact={contact} setContact={setContact} />}
      {tab === "consent" && <Consent contact={contact} setContact={setContact} />}
      {tab === "timeline" && <Timeline />}
    </>
  );
}
