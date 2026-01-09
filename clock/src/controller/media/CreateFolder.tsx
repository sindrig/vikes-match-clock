import React, { useState } from "react";
import { storageHelpers } from "../../firebase";

interface CreateFolderProps {
  prefix: string;
  refresh: () => void;
}

const CreateFolder: React.FC<CreateFolderProps> = ({ prefix, refresh }) => {
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const save = (): void => {
    setCreating(false);
    storageHelpers
      .uploadString(`${String(prefix)}/${String(newFolderName)}/.vikes`, "")
      .then(refresh)
      .catch(alert);
  };
  return (
    <div className="control-item withborder">
      {creating ? (
        <div>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button onClick={save}>Save</button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}>Create folder</button>
      )}
    </div>
  );
};

export default CreateFolder;
