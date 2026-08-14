# Tasks: Dynamic Perimeter Ad Layout

## 1. Clock Data Layer

- [ ] Add ad-layout, applied-layout, lane, status, and file types in
  `clock/src/types.ts`
- [ ] Add strict parsers in `clock/src/contexts/firebaseParsers.ts`
- [ ] Subscribe to desired and daemon-owned applied paths in
  `FirebaseStateContext.tsx`
- [ ] Add one complete-layout write action that always creates a new revision
- [ ] Keep the existing composition diagnostic preview separate

## 2. Clock UI

- [ ] Replace/extend `clock/src/controller/PerimeterControl.tsx`
- [ ] Add focused components for the layout board and add-column file dialog
- [ ] Add modal-scoped styling in `PerimeterControl.css`
- [ ] Reuse existing storage helpers for list/upload behavior
- [ ] Reuse existing sortable-column DnD utilities/patterns

## 3. Daemon

- [ ] Extend `perimeter-control/index.js` configuration with ad-layout
  desired/status paths and lane metadata
- [ ] Add a dedicated ad-layout controller
- [ ] Add a Resolume transport adapter after API discovery
- [ ] Reuse secure GCS staging from `overlay.js`
- [ ] Publish lanes, applied revision, durations, previews, state, and errors
- [ ] Update `perimeter-control/README.md`, `perimeter-control.env.example`,
  and daemon tests

## 4. Documentation

- [ ] Update `clock/AGENTS.md` — perimeter modal is no longer preview-only
- [ ] Document desired/applied split, revision semantics, dynamic lane
  contract, 20-second static duration rule, cycle behavior, and
  non-deleting Storage policy
