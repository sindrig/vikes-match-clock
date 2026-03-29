import { Navigate } from "react-router-dom";
import { useAuth, useIsAdmin } from "../contexts/LocalStateContext";
import { AdminPortal } from "./AdminPortal";

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

  return <AdminPortal />;
}
