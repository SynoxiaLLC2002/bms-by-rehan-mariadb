// The starter layout offered the first time an author opens their page
// editor. Author Bio already reads the photo, name, biography and social
// links live from the account, so there is nothing else to seed; BlockNote
// fills in the block's id and its schema's own defaults (centered, all four
// parts shown) the same way it does for any block inserted through the "+"
// appender.

import type { Block } from "@blocknote/core";

export function defaultAuthorPageBlocks(): Block[] {
  // `nameTag: "h1"` only here, not in the block's own default: this seeded
  // copy *is* the page's one top-level heading, but a block dropped in
  // elsewhere — a "meet the author" byline inside a post, say — should not
  // assume it owns the page and mint a second h1.
  //
  // The trailing empty paragraph gives the author somewhere to write more
  // below the bio card without first needing to know how to insert a block.
  return [
    { type: "authorBio", props: { align: "center", nameTag: "h1" } },
    { type: "paragraph" },
  ] as unknown as Block[];
}
