## 1. Match Transition

- [x] 1.1 Add a Firebase-backed action that atomically clears halftime countdown state, advances to the next configured period, and starts its elapsed clock using server-adjusted time.
- [x] 1.2 Use the new action when the public clock observes halftime countdown expiry, while preserving the existing paused outcome for pre-match countdown expiry.
- [x] 1.3 Replace the manual halftime countdown stop behavior with the same early next-period start action and update its Icelandic label to communicate that it starts the next half.

## 2. Regression Coverage

- [x] 2.1 Add context tests for the next-period transition's Firebase state, including countdown clearing, half-stop progression, and running timestamp.
- [x] 2.2 Add clock tests covering automatic start after halftime expiry and unchanged pre-match countdown expiry behavior.
- [x] 2.3 Add or update controller tests for the early-start action label and ensure a running next period does not expose a second halftime countdown action.

## 3. Verification And Delivery

- [x] 3.1 Run formatter, targeted tests, lint, and the relevant frontend test suite.
- [x] 3.2 Create a pull request for the completed change and apply the `sandbox-deploy` label.
- [ ] 3.3 Verify pre-match countdown, natural halftime expiry, and manual early next-half start in the staging deployment before merge.
