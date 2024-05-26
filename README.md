Match clock

# Structure

## clock

This is the React "clock" application. It contains the match clock that should be displayed in the stadium.

It also includes the original (legacy) admin interface for controlling the match clock.

## clock-api

This contains various lambdas that help with the match clock.

### match-report

Fetches matches based on the two teams that are selected.

### weather

Fetches weather forecast (currently only for Víkin)

## admin

This is the "new" admin application. It's scaffolded using Nuxt.js and vue.

Going forward we aim to have all new development happen here, and gradually move over the functionality from the legacy admin.

Eventually we're open to rewriting the original clock interface here as well
