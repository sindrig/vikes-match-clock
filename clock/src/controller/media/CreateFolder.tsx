import React, { useState } from "react";
import { storage } from "../../firebase";

interface CreateFolderProps {
  prefix: string;
  refresh: () => void;
}

const CreateFolder: React.FC<CreateFolderProps> = ({ prefix, refresh }) => {
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const save = (): void => {
    setCreating(false);
    storage
      .ref(`${String(prefix)}/${String(newFolderName)}/.vikes`)
      .putString("")
      .on("state_changed", null, alert, refresh);
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
