import React from "react";

import TeamPlayerSelectionModal from "./asset/team/TeamPlayerSelectionModal";
import { useHomeTeamQuickActions } from "./asset/team/useHomeTeamQuickActions";
import { useController } from "../contexts/FirebaseStateContext";

const HomeTeamQuickActions = (): React.JSX.Element | null => {
  const { controller } = useController();
  const {
    modalMode,
    modalTitle,
    modalInstruction,
    modalPlayers,
    openSubModal,
    openPlayerCardModal,
    openMOTMModal,
    handleModalSelect,
    closeModal,
  } = useHomeTeamQuickActions();

  const homePlayers = controller.roster?.home ?? [];
  if (homePlayers.length === 0) return null;

  return (
    <div className="home-team-quick-actions">
      <div className="home-team-quick-actions-label">Heimalið aðgerðir</div>
      <div className="home-team-quick-actions-buttons">
        <button type="button" onClick={() => openSubModal("home")}>
          Skipting
        </button>
        <button type="button" onClick={openPlayerCardModal}>
          Birta leikmann
        </button>
        <button type="button" onClick={openMOTMModal}>
          Maður leiksins
        </button>
      </div>
      <TeamPlayerSelectionModal
        open={modalMode !== null}
        onClose={closeModal}
        title={modalTitle}
        instruction={modalInstruction}
        players={modalPlayers}
        onSelect={handleModalSelect}
      />
    </div>
  );
};

export default HomeTeamQuickActions;
