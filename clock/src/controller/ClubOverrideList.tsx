import { Modal, Button, IconButton } from "rsuite";
import TrashIcon from "@rsuite/icons/Trash";
import EditIcon from "@rsuite/icons/Edit";
import { useClubOverrides } from "../contexts/FirebaseStateContext";
import type { ClubOverride } from "../types";

interface ClubOverrideListProps {
  open: boolean;
  onClose: () => void;
  onEdit: (id: string, override: ClubOverride) => void;
  onCreateNew: () => void;
}

const ClubOverrideList = ({
  open,
  onClose,
  onEdit,
  onCreateNew,
}: ClubOverrideListProps) => {
  const { clubOverrides, deleteClubOverride } = useClubOverrides();

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Eyða "${name}"?`)) {
      deleteClubOverride(id).catch((err: unknown) => console.error(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>Lið override</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {Object.keys(clubOverrides).length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
            Engin lið override
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(clubOverrides).map(([id, override]) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  border: "1px solid #eee",
                  borderRadius: 4,
                }}
              >
                <img
                  src={override.logoUrl}
                  alt={override.name}
                  width={40}
                  height={40}
                  style={{ objectFit: "contain" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{override.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    ID: {override.clubId}
                  </div>
                </div>
                <IconButton
                  icon={<EditIcon />}
                  size="xs"
                  onClick={() => onEdit(id, override)}
                  appearance="subtle"
                />
                <IconButton
                  icon={<TrashIcon />}
                  size="xs"
                  color="red"
                  appearance="subtle"
                  onClick={() => handleDelete(id, override.name)}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Button appearance="primary" onClick={onCreateNew}>
            Nýtt lið
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default ClubOverrideList;
