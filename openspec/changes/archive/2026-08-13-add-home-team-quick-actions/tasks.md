## 1. Shared Home-Team Actions

- [x] 1.1 Extract or expose the existing home-team substitution, player-card, and man-of-the-match action behavior so the Lið tab and match view use the same Firebase-backed operations.
- [x] 1.2 Preserve the existing substitution sequence, including on-pitch/off-pitch eligibility filters, roster status updates, queue creation, and home-team asset backgrounds.

## 2. Match-View Quick Actions

- [x] 2.1 Create the `Heimalið aðgerðir` component with `Skipting`, `Birta leikmann`, and `Maður leiksins` controls, rendering only when a home-team roster is available.
- [x] 2.2 Render the component below `MatchCountdownDisplay` in the main controller view and style it consistently with existing operational control boxes.
- [x] 2.3 Use the existing full-size player-selection modal for each quick action, passing the complete home roster for player-card and man-of-the-match selection.

## 3. Verification

- [x] 3.1 Add component tests covering box placement, home-team scoping, and opening each quick-action selection flow.
- [x] 3.2 Add tests confirming substituted-off home players are selectable for player-card and man-of-the-match actions, while substitution selections retain their existing filters.
- [x] 3.3 Run the affected Vitest suites, `pnpm lint`, and Prettier formatting for changed frontend files.
