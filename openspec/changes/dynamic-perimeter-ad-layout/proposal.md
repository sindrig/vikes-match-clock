# Dynamic Perimeter Ad Layout

**Change ID:** `dynamic-perimeter-ad-layout`

## Proposal

Replace the current read-only Resolume composition preview with a
Firebase-controlled perimeter ad layout:

- A layout column represents one ad step across all physical display lanes.
- Every column must contain exactly one file per daemon-published lane.
- Columns play in order and cycle from the final column back to the first.
- Static assets use a 20-second transport duration.
- Video assets run for their Resolume-reported duration.
- Adding, deleting, or reordering a column applies the complete new layout
  immediately.
- Deleting a column removes only its Firebase layout reference, never the
  Storage objects.
- The daemon remains authoritative for validation, staging, Resolume
  operations, applied status, durations, and preview metadata.
