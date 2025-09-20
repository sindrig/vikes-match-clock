import React, { useState } from "react";
import { bindActionCreators } from "redux";

import matchActions from "../actions/match";
import { connect } from "react-redux";
import PropTypes from "prop-types";
function clampScore(value) {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(11, num));
}

function MatchScoreDialog({ onChange, home, away }) {
  const [open, setOpen] = useState(false);

  function handleHomeChange(e) {
    const value = clampScore(e.target.value);
    onChange(value, away);
  }

  function handleAwayChange(e) {
    const value = clampScore(e.target.value);
    onChange(home, value);
  }

  return (
    <div className="control-item stdbuttons">
      <button onClick={() => setOpen(true)}>Rauð spjöld</button>
      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 8,
              minWidth: 220,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 16 }}>
              <label>
                Home Team:
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={home}
                  onChange={handleHomeChange}
                  style={{ marginLeft: 8, width: 50 }}
                />
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>
                Away Team:
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={away}
                  onChange={handleAwayChange}
                  style={{ marginLeft: 8, width: 50 }}
                />
              </label>
            </div>
            <div className="stdbuttons">
              <button onClick={() => onChange(0, 0) && setOpen(false)}>
                Hreinsa spjöld
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

MatchScoreDialog.propTypes = {
  home: PropTypes.number.isRequired,
  away: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
};

const stateToProps = ({ match }) => {
  return {
    home: match.homeRedCards ?? 0,
    away: match.awayRedCards ?? 0,
  };
};
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      onChange: matchActions.updateRedCards,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(MatchScoreDialog);
