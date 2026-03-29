import { useState } from "react";
import { Table, Button, Tag, Modal } from "rsuite";
import { deleteInvitation } from "./adminFunctions";
import { InvitationModal } from "./InvitationModal";
import type { Invitation, LocationDef } from "./useAdminData";

const { Column, HeaderCell, Cell } = Table;

interface InvitationTableProps {
  invitations: Invitation[];
  locations: LocationDef[];
}

function formatTimestamp(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("is-IS");
  } catch {
    return String(ts);
  }
}

export function InvitationTable({
  invitations,
  locations,
}: InvitationTableProps) {
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalOpen, setModalOpen] = useState(false);
  const [editInvitation, setEditInvitation] = useState<Invitation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invitation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreate = () => {
    setModalMode("create");
    setEditInvitation(null);
    setModalOpen(true);
  };

  const handleEdit = (inv: Invitation) => {
    setModalMode("edit");
    setEditInvitation(inv);
    setModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteInvitation(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Villa við að eyða boði";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="admin-section-header">
        <div />
        <Button appearance="primary" size="sm" onClick={handleCreate}>
          Bjóða notanda
        </Button>
      </div>

      {invitations.length === 0 ? (
        <div className="admin-table-empty">
          <p>Engar boðskortur</p>
        </div>
      ) : (
        <Table autoHeight data={invitations} rowKey="id">
          <Column flexGrow={2} minWidth={200}>
            <HeaderCell>Netfang</HeaderCell>
            <Cell>{(rowData: Invitation) => rowData.email}</Cell>
          </Column>

          <Column flexGrow={2} minWidth={200}>
            <HeaderCell>Skjáir</HeaderCell>
            <Cell>
              {(rowData: Invitation) => {
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

          <Column flexGrow={1} minWidth={150}>
            <HeaderCell>Stofnað af</HeaderCell>
            <Cell>{(rowData: Invitation) => rowData.createdBy || "—"}</Cell>
          </Column>

          <Column width={180}>
            <HeaderCell>Stofnað</HeaderCell>
            <Cell>
              {(rowData: Invitation) => formatTimestamp(rowData.createdAt)}
            </Cell>
          </Column>

          <Column width={150} fixed="right">
            <HeaderCell>Aðgerðir</HeaderCell>
            <Cell>
              {(rowData: Invitation) => (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    size="xs"
                    appearance="link"
                    onClick={() => handleEdit(rowData)}
                  >
                    Breyta
                  </Button>
                  <Button
                    size="xs"
                    appearance="link"
                    color="red"
                    onClick={() => setDeleteTarget(rowData)}
                  >
                    Eyða
                  </Button>
                </div>
              )}
            </Cell>
          </Column>
        </Table>
      )}

      <InvitationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        invitation={editInvitation}
        locations={locations}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="xs"
      >
        <Modal.Header>
          <Modal.Title>Eyða boði</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteError && (
            <p style={{ color: "red", marginBottom: "1rem" }}>{deleteError}</p>
          )}
          <p>
            Ertu viss um að þú viljir eyða boðinu til{" "}
            <strong>{deleteTarget?.email}</strong>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            appearance="primary"
            color="red"
            onClick={handleDeleteConfirm}
            disabled={deleting}
            loading={deleting}
          >
            Eyða
          </Button>
          <Button
            appearance="subtle"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Hætta við
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
