import { ChangeEvent } from "react";
import { Player } from "../../../types";

const handler = (
  onChange: (update: Partial<Player>) => void,
  attr: keyof Player,
  event: ChangeEvent<HTMLInputElement>,
): void => {
  event.preventDefault();
  const {
    target: { value },
  } = event;
  let newValue: string | number = value;
  if (attr === "number") {
    newValue = parseInt(value, 10);
    if (Number.isNaN(newValue)) {
      return;
    }
  }
  onChange({ [attr]: newValue });
};

interface TeamPlayerProps {
  player: Player;
  onChange: (update: Partial<Player>) => void;
}

const TeamPlayer = ({
  player,
  onChange,
}: TeamPlayerProps): React.JSX.Element => (
  <div className="team-player">
    <input
      type="checkbox"
      checked={player.show || false}
      onChange={() => onChange({ show: !player.show })}
      className="team-player-show"
    />
    <input
      type="text"
      value={player.number || (player.role && player.role[0]) || ""}
      onChange={(e) => handler(onChange, "number", e)}
      className="team-player-number"
      placeholder="#"
    />
    <input
      type="text"
      value={player.name || ""}
      onChange={(e) => handler(onChange, "name", e)}
      className="team-player-name"
      placeholder="Nafn"
      style={player.id ? {} : { backgroundColor: "red" }}
    />
  </div>
);

export default TeamPlayer;
