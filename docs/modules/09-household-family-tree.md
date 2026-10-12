# Module 09 — Household Family Tree

Status: **Built**. New API: `POST/GET /voters/{id}/relationships`,
`DELETE /voters/{id}/relationships/{relationshipId}`, `GET /households/{id}/family-tree`, and
`headOfHouseholdId` on `Household`. New UI: the "Manage family & owner" flow inside the map's
household edit panel (Module 08). Full schemas: `docs/openapi.yaml` or `/api-docs`.

## What was asked for, and the one constraint that shaped it

The request was: on the map's household form, capture a house owner, a family member count, and
a visual family tree (spouse, children, grandchildren) — and it must be matched against the
existing voter list, not free-typed. That last part is the load-bearing constraint: **every
person in a family tree is a real `Voter` row, found by search and linked. There is no path
anywhere in this module that creates a new voter inline.** Both sides of every relationship, and
the household's head, are real foreign keys into the `Voter` table — this is enforced by
construction (they're actual FKs), not by a special check bolted on somewhere.

## Data model: two relation types are enough for an arbitrarily deep tree

`VoterRelationship` has just `SPOUSE` (symmetric — one row per pair, direction is meaningless)
and `PARENT_OF` (directional: `voterId` is the parent, `relatedVoterId` is the child).
"Grandchild" isn't its own type — it falls out automatically from walking `PARENT_OF` edges two
levels deep (`households.familyTree.ts`'s `buildDescendants` recurses with no depth limit), so
the tree goes as deep as real data supports for free, not just the three generations in the
original ask.

A relationship is between two voters directly and does **not** require either side's
`householdId` to match any particular household, and creating one never changes anyone's
`householdId`. Household residency and family-tree membership are deliberately orthogonal: an
adult child who's moved out (different or no `householdId`) can still appear in a parent's
household's tree. The one place residency *is* enforced is `Household.headOfHouseholdId` itself —
setting someone as head requires their `Voter.householdId` already equal that household's id (see
below).

## The map UI flow

1. **Link residents.** In the household edit panel, "Manage family & owner" opens a modal.
   Searching by name (`GET /voters?search=...&wardId=...`, scoped to the household's own ward —
   see the pitfall below) and clicking "Link" sets that voter's `householdId` to this household
   via the ordinary `PATCH /voters/{id}` endpoint that already existed — no new backend surface
   for linking itself.
2. **Set a house owner.** Once at least one resident exists, a dropdown (built from the current
   residents) lets you pick one as `headOfHouseholdId`.
3. **Build relationships.** Two dropdowns (built from current residents) plus a relation-type
   selector ("is the spouse of" / "is the parent of") call
   `POST /voters/{fromId}/relationships`.
4. **See the tree.** Rendered from `GET /households/{id}/family-tree`, which returns a nested
   structure rooted at the head (head+spouse combined into one box, then each generation below).
   The UI draws it with a classic pure-CSS org-chart technique (nested `<ul>`/`<li>`, connector
   lines from `::before`/`::after` borders — see the `.tree` rules in `public/map/style.css`) —
   no charting library.

The relationship builder currently only offers voters already linked as *residents* of this
household — you can't use it to relate two voters neither of which is here yet. This matches how
someone would actually work through this door-to-door (link who lives here, then describe how
they're related to each other), not a general-purpose "relate any two voters in the org" tool.

## A real bug this caught: search-then-link needs the same ward filter the backend enforces

`PATCH /voters/{id}` (linking a voter to a household) already validates that the household
belongs to that voter's own ward — a real constraint from Module 02, not new. The first version
of this UI's link-search ran `GET /voters?search=...` with **no** ward filter, so it happily
showed matching voters from *any* ward — and clicking "Link" on one of those 400'd with "Household
does not belong to the given ward," discovered by actually driving the flow in a browser rather
than just exercising the API directly. Fixed by scoping the search to
`wardId: state.familyHousehold.wardId`, so only voters who could actually succeed ever show up as
candidates.

## Why `headOfHouseholdId` requires prior residency but relationships don't

This is an intentional asymmetry, not an oversight: the *head of household* is meant to represent
"the person this household record is anchored to," which only makes sense if they're actually a
resident (`Voter.householdId` = this household). A *relationship*, by contrast, describes a real
family connection that can legitimately span households (a married daughter at a different
address is still the head's daughter). Enforcing residency on relationships too would make the
tree unable to represent that completely ordinary case.

## What was intentionally NOT built here

- **Creating a new voter inline while building the tree.** The explicit, deliberate constraint
  this whole module was built around — see above.
- **Editing or un-linking a resident from within the family modal.** You can link a voter to a
  household here, but removing one (`PATCH /voters/{id}` with `householdId: null`) or editing
  their core fields still goes through the regular Voters flow, not this modal.
- **Removing a relationship from the map UI.** `DELETE /voters/{id}/relationships/{relationshipId}`
  exists and works (verified directly against the API), but the family modal has no "×" per edge
  to call it — only adding relationships, not curating mistakes, is wired up in this pass.
- **Cycle detection on `PARENT_OF`.** Flagged in the schema's own design note: a human building a
  tree through this UI (which only ever offers existing residents, not an open-ended
  "search all voters" step) is exceedingly unlikely to create one, and detecting cycles properly
  needs a graph walk on every write. A known gap, not a silent one.
- **Relating two voters who aren't both residents of the same household yet.** Covered above.
