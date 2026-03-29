import { useState, useEffect } from "react";
import { Modal, Button, Checkbox, CheckboxGroup, Loader } from "rsuite";
import { setUserLocations } from "./adminFunctions";
import type { AdminUser, LocationDef } from "./useAdminData";

interface UserEditModalProps {
  open: boolean;
  onClose: () => void;
  user: AdminUser | null;
  locations: LocationDef[];
}

export function UserEditModal({
  open,
  onClose,
  user,
  locations,
}: UserEditModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const active = Object.entries(user.locations)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      setSelected(active);
    }
    setError(null);
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const locationMap: Record<string, boolean> = {};
      for (const loc of locations) {
        locationMap[loc.key] = selected.includes(loc.key);
      }
      await setUserLocations(user.uid, locationMap);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Villa við að vista breytingar";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const displayEmail = user?.email ?? "Óþekktur notandi";

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>Breyta aðgangi — {displayEmail}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}
        <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>Skjáaðgangur:</p>
        {locations.length === 0 ? (
          <p style={{ color: "#999", fontStyle: "italic" }}>
            Engir skjáir skilgreindir
          </p>
        ) : (
          <CheckboxGroup
            name="locations"
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
      </Modal.Body>
      <Modal.Footer>
        <Button
          appearance="primary"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
        >
          {saving ? <Loader size="xs" /> : "Vista"}
        </Button>
        <Button appearance="subtle" onClick={onClose} disabled={saving}>
          Hætta við
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
