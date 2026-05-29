import { useController } from "../../../contexts/FirebaseStateContext";
import "./SubstitutionInfo.css";

const SubstitutionInfo = () => {
  const { controller } = useController();
  const { currentAsset } = controller;

  if (!currentAsset) return null;

  const { subIn, subOut } = currentAsset.asset;
  if (!subIn || !subOut) return null;

  const teamName = subIn.teamName || subOut.teamName || "";

  const formatPlayer = (name?: string, number?: number | string) => {
    if (!name) return "";
    return number !== undefined ? `#${number} - ${name}` : name;
  };

  return (
    <div className="substitution-info" data-testid="substitution-info">
      {teamName && <span className="substitution-info-team">{teamName}</span>}
      <span className="substitution-info-player">
        Af velli: {formatPlayer(subIn.fullName || subIn.name, subIn.number)}
      </span>
      <span className="substitution-info-player">
        Inn á: {formatPlayer(subOut.fullName || subOut.name, subOut.number)}
      </span>
    </div>
  );
};

export default SubstitutionInfo;
