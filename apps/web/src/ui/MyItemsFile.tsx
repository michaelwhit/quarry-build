import { useState } from "react";
import {
  MAX_MY_ITEMS_FILE_BYTES,
  MY_ITEMS_FILE_NAME,
  exportMyItems,
  hasMyItems,
  importMyItems,
} from "../data/myItemsFile.ts";
import { useMyAccommodations } from "../data/myAccommodations.ts";
import { useMyGoals } from "../data/myItems.ts";

/** Save My items to a file, or load a file saved from this app (wording only, no students). */
export function MyItemsFile() {
  useMyGoals();
  useMyAccommodations();
  const [message, setMessage] = useState("");
  const any = hasMyItems();
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportMyItems()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = MY_ITEMS_FILE_NAME;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Saved My items to a file.");
  };
  return (
    <section className="lib-filters" aria-label="My items file">
      <p className="meta">
        My items file: wording only, made up for practice. Load only a file saved from this app. Do
        not put student names in your wording.
      </p>
      <button
        type="button"
        disabled={!any}
        aria-describedby={any ? undefined : "my-items-file-hint"}
        onClick={download}
      >
        Save My items to a file
      </button>
      {!any && (
        <p id="my-items-file-hint" className="meta">
          Nothing in My items yet. Save a goal's wording or an accommodation to My items first.
        </p>
      )}
      <label className="btn file-btn">
        Load My items from a file
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > MAX_MY_ITEMS_FILE_BYTES) {
              setMessage("That file is too large.");
              return;
            }
            void f.text().then((t) => setMessage(importMyItems(t).message));
          }}
        />
      </label>
      <p className="saved" role="status">
        {message}
      </p>
    </section>
  );
}
