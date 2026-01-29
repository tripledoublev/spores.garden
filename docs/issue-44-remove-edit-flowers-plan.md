# Issue #44 – Remove flowers & edit annotations (implementation plan)

**Context:** Issue #44 (Webring / “Pick a flower”) is largely implemented via `garden.spores.social.takenFlower` (Collected Flowers). The remaining feedback is:

> **Additional feature request** – user should be able to remove flowers and edit annotations.

This plan covers **remove**, **edit annotation**, and the **copy change** (Take a seed → Pick a flower). It does not cover required annotation validation or the 8-flower limit (those can be separate tasks).

---

## 1. Behaviour

- **Remove flower**  
  Garden owner can delete a collected flower (one `takenFlower` record) from their repo.  
  - Show a confirmation modal before deleting.  
  - After delete: refresh the Collected Flowers section so the flower disappears.

- **Edit annotation**  
  Garden owner can change the `note` on an existing collected flower.  
  - Open a small modal (or inline form) with current note, max 500 chars.  
  - On save: `putRecord` with same `sourceDid`/`createdAt`, updated `note`.  
  - After update: refresh the Collected Flowers section.

- **Who sees controls**  
  Only the **garden owner** (viewing their own garden and logged in) sees Remove and Edit.  
  Use: `isLoggedIn() && getCurrentDid() === getSiteOwnerDid()`.

---

## 2. Data

- **Delete:** `deleteRecord('garden.spores.social.takenFlower', rkey)` (from `oauth`).
- **Edit:** `putRecord('garden.spores.social.takenFlower', rkey, { sourceDid, createdAt, note })` (from `oauth`). Keep `sourceDid` and `createdAt` unchanged; only `note` may change.
- **rkey:** Each list item already has a record from `listRecords`; get rkey via `record.uri?.split('/').pop()` (same pattern as in `site-editor.ts` / `site-data.ts`).

---

## 3. Files to touch

| File | Change |
|------|--------|
| `src/layouts/collected-flowers.ts` | Add `canManageFlowers`; for each flower, add Remove + Edit when owner; wire to `deleteRecord` / `putRecord` and refresh callback. |
| `src/components/section-block.ts` | Pass a refresh callback into `renderCollectedFlowers` (e.g. `onRefresh: () => this.render()`). |

No new files strictly required; shared modal for “edit note” can live inside `collected-flowers.ts` (or a small helper) to match the existing “Take a seed” modal in `site-interactions.ts`.

---

## 4. Implementation details

### 4.1 `renderCollectedFlowers(section, options?)`

- **Signature:** Extend to `renderCollectedFlowers(section, options?: { onRefresh?: () => void })`.
- **Ownership:**  
  `visitorDid = getCurrentDid()`, `ownerDid = getSiteOwnerDid()`.  
  `canManageFlowers = isLoggedIn() && visitorDid && visitorDid === ownerDid`.
- **Per-flower:**  
  Store `rkey = flowerRecord.uri?.split('/').pop()`, and full `value` (for edit: `sourceDid`, `createdAt`, `note`).
- **Remove:**  
  Button/link “Remove” (or icon) on the flower tile. On click → `showConfirmModal({ title: 'Remove flower', message: '…', confirmText: 'Remove', confirmDanger: true })` → if confirmed, `deleteRecord('garden.spores.social.takenFlower', rkey)` → `options?.onRefresh?.()`.
- **Edit:**  
  Button/link “Edit” on the flower tile. On click → open modal with `<textarea>` pre-filled with `note`, maxLength 500, Save/Cancel. On Save → `putRecord('garden.spores.social.takenFlower', rkey, { sourceDid, createdAt, note: newNote })` → close modal → `options?.onRefresh?.()`.
- **Imports:** Add `isLoggedIn`, `deleteRecord`, `putRecord` from `../oauth`, and `showConfirmModal` from `../utils/confirm-modal`.

### 4.2 `section-block.ts`

- In the `collected-flowers` branch, call:  
  `renderCollectedFlowers(this.section, { onRefresh: () => this.render() })`.  
  This way, after any remove or edit, the section re-renders and the list stays in sync.

### 4.3 UI placement

- Keep flower + link as today; add a small controls row or icon group per tile (e.g. “Edit” and “Remove”) when `canManageFlowers`.  
- Use existing classes (e.g. `button button-secondary button-small`) and, if needed, a `.flower-grid-item-actions` or similar so Remove can use `button-danger` for the confirm button (already supported by `showConfirmModal` with `confirmDanger: true`).

### 4.4 Empty note on edit

- Lexicon allows optional `note`. So “Edit” can show an empty textarea; saving with empty string is valid (omit `note` or send `note: ''` depending on lexicon/server behaviour; current lexicon has `note` optional, so either is fine).

---

## 5. Text changes (Pick a flower) — done

User-visible copy has been updated to match issue #44 in `site-interactions.ts`, `site-renderer.ts`, and `collected-flowers.ts`: button "Pick a flower", modal title and body, note label, notifications ("Flower picked!", "Already picked", "Failed to pick flower"), and empty-state paragraph. CSS classes and IDs have been renamed to flower wording: `take-flower-btn`, `take-flower-form`, `flower-note`.

---

## 6. Optional follow-ups (not in this plan)

- Enforce **max 8 flowers** when adding (and/or when displaying), per issue comment.
- Make annotation **required** when picking a flower (modal validation).

---

## 7. Testing (manual)

1. Log in as garden owner, open a garden that has a Collected Flowers section with at least one flower.
2. Remove: click Remove → confirm → flower disappears and section still renders.
3. Edit: click Edit → change note → Save → section refreshes and new note is shown.
4. As visitor (or logged out), ensure Remove/Edit are not shown.
