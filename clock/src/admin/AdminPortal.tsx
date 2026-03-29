import { Link } from "react-router-dom";
import { Button, Panel, Loader } from "rsuite";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/LocalStateContext";
import { useAdminData } from "./useAdminData";
import { UserTable } from "./UserTable";
import { InvitationTable } from "./InvitationTable";
import "rsuite/dist/rsuite.min.css";
import "./AdminPortal.css";

export function AdminPortal() {
  const authState = useAuth();
  const { users, invitations, locations, loading, error, refreshUsers } =
    useAdminData();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore logout errors
    }
  };

  return (
    <div className="admin-portal">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>Vikes Klukka — Stjórnborð</h1>
          <span className="admin-badge">{authState.email ?? "Stjórnandi"}</span>
        </div>
        <div className="admin-header-right">
          <Link to="/">
            <Button appearance="subtle" size="sm">
              Til baka
            </Button>
          </Link>
          <Button appearance="ghost" size="sm" onClick={handleLogout}>
            Útskrá
          </Button>
        </div>
      </header>

      {error && (
        <Panel
          bordered
          style={{
            marginBottom: "1rem",
            background: "#fff0f0",
            borderColor: "#ffcccc",
          }}
        >
          <p style={{ color: "red", margin: 0 }}>{error}</p>
          <Button
            appearance="link"
            size="sm"
            onClick={refreshUsers}
            style={{ paddingLeft: 0, marginTop: "0.5rem" }}
          >
            Reyna aftur
          </Button>
        </Panel>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <Loader size="md" content="Hleð gögnum..." />
        </div>
      ) : (
        <>
          <section className="admin-section">
            <Panel header="Notendur og skjáaðgangur" bordered>
              <UserTable users={users} locations={locations} />
            </Panel>
          </section>

          <section className="admin-section">
            <Panel header="Boð í bið" bordered>
              <InvitationTable
                invitations={invitations}
                locations={locations}
              />
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
