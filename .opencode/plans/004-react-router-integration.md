# Spec 004: React Router Integration

**Issue**: #135 - Authz management portal
**Type**: Frontend infrastructure -- add routing to the clock app

## Context

The clock app (`clock/src/`) is a single-page application with no router. All "routing" is done via conditional rendering based on `isAuthenticated` and `listenPrefix` state in `App.tsx` and `Controller.tsx`.

The admin portal needs a separate route (`/admin`) so admins can navigate between the main clock app and the admin interface. Using `react-router-dom` as chosen.

## Changes

### Install dependency

```
pnpm add react-router-dom
```

### Infrastructure: SPA routing for CloudFront + S3

Client-side routing requires that all paths (e.g. `/admin`) serve `index.html` instead of returning S3 404s. The CloudFront distribution (managed by `cloudposse/cloudfront-s3-cdn` in `infra/modules/web/frontend.tf`) needs a custom error response:

- **CloudFront custom error response**: Return `index.html` with HTTP 200 for 403/404 errors from S3.
- **Cache busting**: Ensure the custom error response respects cache invalidation so stale `index.html` is not served. The module's `custom_error_response` variable can configure this.

This change must be applied in the Terraform `webpage` module call. Example:

```hcl
custom_error_response = [
  {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  },
  {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
]
```

### New file: `clock/src/router.tsx`

Define the app's routes:

```
/          -> existing App component (all current behavior)
/admin     -> AdminPortal component (new, see spec 006)
```

### Modified file: `clock/src/index.tsx`

Wrap the app in `BrowserRouter`. The provider nesting becomes:

```
<BrowserRouter>
  <LocalStateProvider>
    <Routes>
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/*" element={
        <FirebaseStateProvider ...>
          <App />
        </FirebaseStateProvider>
      } />
    </Routes>
  </LocalStateProvider>
</BrowserRouter>
```

Key decisions:
- `LocalStateProvider` (auth state) wraps the router so auth is available on all routes
- `FirebaseStateProvider` wraps only the main app route, NOT the admin route. The admin portal does not need match/controller/view state subscriptions.
- The admin route has its own `AdminRoute` wrapper that checks auth + admin status before rendering.

### Modified file: `clock/src/App.tsx`

No structural changes needed. The existing conditional rendering logic remains intact. The `App` component continues to handle the four states (unauthenticated, loading, screen selector, full UI) exactly as before.

### New file: `clock/src/admin/AdminRoute.tsx`

Route guard component:
1. Reads auth state from `useAuth()`
2. If not authenticated, redirects to `/` (the main app handles login)
3. If authenticated but not admin, shows "Access denied" message with link back to `/`
4. If authenticated and admin, renders `<AdminPortal />`

### Navigation from main app to admin

In `Controller.tsx`, when the user is authenticated and on the screen selector (state: `isAuthenticated && !listenPrefix`), check `isAdmin` from context. If true, render a red `<Link to="/admin">` button above the screen selector buttons.

The admin badge (small "Admin" indicator) is also shown in this state.

## Migration strategy

- All existing URLs (`/`, any deep links) continue to work unchanged
- The `/*` catch-all route ensures the main app handles any non-admin path
- No breaking changes to existing behavior

## Files affected

- `clock/package.json` -- add `react-router-dom` dependency
- `clock/src/index.tsx` -- wrap in BrowserRouter, define routes
- `clock/src/admin/AdminRoute.tsx` -- new route guard
- `clock/src/controller/Controller.tsx` -- add admin button when `isAdmin`
- `clock/src/contexts/LocalStateContext.tsx` -- expose `isAdmin` (see spec 005)
- `infra/modules/web/frontend.tf` -- add CloudFront custom error responses for SPA routing

## Testing

1. Navigating to `/` renders the existing app with no changes
2. Navigating to `/admin` when not logged in redirects to `/`
3. Navigating to `/admin` as non-admin shows access denied
4. Navigating to `/admin` as admin renders AdminPortal
5. Red admin button appears on screen selector for admin users
6. Existing E2E tests continue to pass (they use `/`)

## Acceptance criteria

1. `react-router-dom` is installed and routes are configured
2. Main app (`/`) behavior is completely unchanged
3. Admin route (`/admin`) is protected by auth + admin check
4. Navigation between main app and admin portal works via links
5. Browser back/forward works correctly
