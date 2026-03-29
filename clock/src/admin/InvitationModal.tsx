import { useState, useEffect } from "react";
import { Modal, Button, Input, Checkbox, CheckboxGroup, Loader } from "rsuite";
import { createInvitation, updateInvitation } from "./adminFunctions";
import type { Invitation, LocationDef } from "./useAdminData";

interface InvitationModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  invitation: Invitation | null;
  locations: LocationDef[];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function InvitationModal({
  open,
  onClose,
  mode,
  invitation,
  locations,
}: InvitationModalProps) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && invitation) {
      setEmail(invitation.email);
      const active = Object.entries(invitation.locations)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      setSelected(active);
    } else {
      setEmail("");
      setSelected([]);
    }
    setError(null);
  }, [mode, invitation, open]);

  const handleSave = async () => {
    setError(null);

    if (mode === "create" && !isValidEmail(email)) {
      setError("Ógilt netfang");
      return;
    }

    if (selected.length === 0) {
      setError("Veldu að minnsta kosti einn skjá");
      return;
    }

    setSaving(true);

    try {
      const locationMap: Record<string, boolean> = {};
      for (const loc of locations) {
        locationMap[loc.key] = selected.includes(loc.key);
      }

      if (mode === "create") {
        await createInvitation(email, locationMap);
      } else if (invitation) {
        await updateInvitation(invitation.id, locationMap);
      }
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Villa við að vista boð";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "create" ? "Bjóða notanda" : "Breyta boði";
  const submitLabel = mode === "create" ? "Bjóða" : "Vista";

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="invitation-email"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontWeight: 500,
            }}
          >
            Netfang:
          </label>
          <Input
            id="invitation-email"
            value={email}
            onChange={(value) => setEmail(value)}
            disabled={mode === "edit"}
            placeholder="notandi@dæmi.is"
          />
        </div>
        <div>
          <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>
            Skjáaðgangur:
          </p>
          {locations.length === 0 ? (
            <p style={{ color: "#999", fontStyle: "italic" }}>
              Engir skjáir skilgreindir
            </p>
          ) : (
            <CheckboxGroup
              name="invitation-locations"
              value={selected}
              onChange={(value) => setSelected(value as string[])}
            >
              {locations.map((loc) => (
                <Checkbox key={loc.key} value={loc.key}>
                  {loc.label}
                </Checkbox>
              ))}
            </CheckboxGroup>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          appearance="primary"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
        >
          {saving ? <Loader size="xs" /> : submitLabel}
        </Button>
        <Button appearance="subtle" onClick={onClose} disabled={saving}>
          Hætta við
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
