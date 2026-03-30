import { useMemo, useState } from "react";
import { Table, Button, Tag, Nav } from "rsuite";
import { UserEditModal } from "./UserEditModal";
import type { AdminUser, LocationDef } from "./useAdminData";

const { Column, HeaderCell, Cell } = Table;

type TabKey = "enabled" | "disabled";

interface ManageUsersProps {
  users: AdminUser[];
  locations: LocationDef[];
  onRefresh: () => void;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("is-IS");
  } catch {
    return dateStr;
  }
}

function sortByEmail(a: AdminUser, b: AdminUser): number {
  return (a.email ?? "").localeCompare(b.email ?? "", "is");
}

export function ManageUsers({ users, locations, onRefresh }: ManageUsersProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("enabled");
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const filteredUsers = useMemo(() => {
    const isDisabledTab = activeTab === "disabled";
    return users.filter((u) => u.disabled === isDisabledTab).sort(sortByEmail);
  }, [users, activeTab]);

  const emptyMessage =
    activeTab === "enabled"
      ? "Engir virkir notendur"
      : "Engir óvirkir notendur";

  return (
    <>
      <Nav
        appearance="subtle"
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key as TabKey)}
        style={{ marginBottom: "1rem" }}
      >
        <Nav.Item eventKey="enabled">Virkir</Nav.Item>
        <Nav.Item eventKey="disabled">Óvirkir</Nav.Item>
      </Nav>

      {filteredUsers.length === 0 ? (
        <div className="admin-table-empty">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <Table autoHeight data={filteredUsers} rowKey="uid">
          <Column flexGrow={2} minWidth={200}>
            <HeaderCell>Netfang</HeaderCell>
            <Cell>{(rowData: AdminUser) => rowData.email ?? "—"}</Cell>
          </Column>

          <Column flexGrow={1} minWidth={150}>
            <HeaderCell>Nafn</HeaderCell>
            <Cell>{(rowData: AdminUser) => rowData.displayName ?? "—"}</Cell>
          </Column>

          <Column flexGrow={2} minWidth={200}>
            <HeaderCell>Skjáir</HeaderCell>
            <Cell>
              {(rowData: AdminUser) => {
                const active = Object.entries(rowData.locations)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k);
                if (active.length === 0) {
                  return <span style={{ color: "#999" }}>Enginn</span>;
                }
                return (
                  <div className="admin-location-tags">
                    {active.map((key) => {
                      const loc = locations.find((l) => l.key === key);
                      return (
                        <Tag key={key} size="sm">
                          {loc?.label ?? key}
                        </Tag>
                      );
                    })}
                  </div>
                );
              }}
            </Cell>
          </Column>

          <Column width={180}>
            <HeaderCell>Síðasta innskráning</HeaderCell>
            <Cell>
              {(rowData: AdminUser) => formatDate(rowData.lastSignIn)}
            </Cell>
          </Column>

          <Column width={100} fixed="right">
            <HeaderCell>Aðgerðir</HeaderCell>
            <Cell>
              {(rowData: AdminUser) => (
                <Button
                  size="xs"
                  appearance="link"
                  onClick={() => setEditUser(rowData)}
                >
                  Breyta
                </Button>
              )}
            </Cell>
          </Column>
        </Table>
      )}

      <UserEditModal
        open={editUser !== null}
        onClose={() => setEditUser(null)}
        user={editUser}
        locations={locations}
        onRefresh={onRefresh}
      />
    </>
  );
}
