import { useState } from "react";
import { Table, Button, Tag } from "rsuite";
import { UserEditModal } from "./UserEditModal";
import type { AdminUser, LocationDef } from "./useAdminData";

const { Column, HeaderCell, Cell } = Table;

interface UserTableProps {
  users: AdminUser[];
  locations: LocationDef[];
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("is-IS");
  } catch {
    return dateStr;
  }
}

export function UserTable({ users, locations }: UserTableProps) {
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  if (users.length === 0) {
    return (
      <div className="admin-table-empty">
        <p>Engir notendur skráðir</p>
      </div>
    );
  }

  return (
    <>
      <Table autoHeight data={users} rowKey="uid">
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
          <Cell>{(rowData: AdminUser) => formatDate(rowData.lastSignIn)}</Cell>
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

      <UserEditModal
        open={editUser !== null}
        onClose={() => setEditUser(null)}
        user={editUser}
        locations={locations}
      />
    </>
  );
}
