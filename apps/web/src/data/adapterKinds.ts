// Which kind of edit the assignment adapter can make for each library accommodation. The adapter
// reads only these names, never the accommodation's own wording (which can say why a student has
// it). An accommodation with no kind is "handled by the teacher" and the adapter never claims to
// have applied it. Names only; the adapter itself is built later. Made-up practice library.

export const ADAPTER_KINDS = [
  "chunking",
  "large_print",
  "reduced_clutter",
  "word_bank",
  "fewer_items",
  "read_aloud",
  "extended_time",
  "sentence_starters",
  "graphic_organizer",
  "simplified_directions",
  "math_reference",
  "visual_support",
  "setting_cue",
  "breaks_cue",
] as const;
export type AdapterKind = (typeof ADAPTER_KINDS)[number];

/** Accommodation id to the kind of edit. Ids not listed here are in UNTAGGED_ACCOMMODATIONS. */
export const ADAPTER_KIND_BY_ID: Readonly<Record<string, AdapterKind>> = {
  "a-time": "extended_time",
  "a-aloud": "read_aloud",
  "a-quiet": "setting_cue",
  "a-organizer": "graphic_organizer",
  "a-breaks": "breaks_cue",
  "a-chunk": "chunking",
  "a-seat": "setting_cue",
  "a-calc": "math_reference",
  "a-reduced": "fewer_items",
  "a-largeprint": "large_print",
  "a-clutter": "reduced_clutter",
  "a-headphones": "setting_cue",
};

/** Library accommodations that change nothing on the page; the adapter leaves them to the teacher. */
export const UNTAGGED_ACCOMMODATIONS: readonly string[] = [
  "a-visual",
  "a-notes",
  "a-preview",
  "a-checklist",
  "a-scribe",
  "a-checkin",
];

export const adapterKindOf = (accommodationId: string): AdapterKind | undefined =>
  Object.hasOwn(ADAPTER_KIND_BY_ID, accommodationId)
    ? ADAPTER_KIND_BY_ID[accommodationId]
    : undefined;
