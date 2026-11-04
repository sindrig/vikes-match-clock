import { useController } from "../../../contexts/FirebaseStateContext";
import "./SubstitutionInfo.css";

const SubstitutionInfo = () => {
  const { controller } = useController();
  const { currentAsset } = controller;

  if (currentAsset?.asset.type !== "SUB") return null;

  const { subIn, subOut } = currentAsset.asset;
  const teamName = subIn.teamName || subOut.teamName || "";

  const formatPlayer = (name?: string, number?: number | string) => {
    if (!name) return "";
    return number !== undefined ? `#${number} - ${name}` : name;
  };

  return (
    <div className="substitution-info" data-testid="substitution-info">
      {teamName && <span className="substitution-info-team">{teamName}</span>}
      <span className="substitution-info-player">
        Af velli: {formatPlayer(subOut.fullName || subOut.name, subOut.number)}
      </span>
      <span className="substitution-info-player">
        Inn á: {formatPlayer(subIn.fullName || subIn.name, subIn.number)}
      </span>
    </div>
  );
};

export default SubstitutionInfo;
