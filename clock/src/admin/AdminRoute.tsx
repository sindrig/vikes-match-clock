import { Navigate } from "react-router-dom";
import { useAuth, useIsAdmin } from "../contexts/LocalStateContext";

export function AdminRoute() {
  const auth = useAuth();
  const isAdmin = useIsAdmin();

  if (auth.isEmpty || !auth.isLoaded) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Aðgangur bannaður</h2>
        <p>Þú hefur ekki stjórnandaaðgang.</p>
        <a href="/">Til baka</a>
      </div>
    );
  }

  // AdminPortal will be added in spec 006, use a placeholder for now
  return (
    <div style={{ padding: "2rem" }}>
      <h2>Stjórnborð</h2>
      <p>Admin portal loading...</p>
      <a href="/">Til baka</a>
    </div>
  );
}
