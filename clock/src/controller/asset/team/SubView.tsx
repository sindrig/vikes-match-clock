import { Player } from "../../../types";

interface SubViewProps {
  subTeam?: string | null;
  subIn?: Player | null;
  subOut?: Player | null;
}

const SubView = ({ subTeam, subIn, subOut }: SubViewProps): React.JSX.Element => (
  <div>
    {subTeam}
    {subIn && (
      <div className="substition-player">
        Út:
        {subIn.number !== undefined ? `#${subIn.number} - ${subIn.name}` : subIn.name}
      </div>
    )}
    {subOut && (
      <div className="substition-player">
        Inn:
        {subOut.number !== undefined ? `#${subOut.number} - ${subOut.name}` : subOut.name}
      </div>
    )}
  </div>
);

export default SubView;
