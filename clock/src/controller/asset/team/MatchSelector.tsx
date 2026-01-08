import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import { RootState } from "../../../types";

import controllerActions from "../../../actions/controller";

const mapStateToProps = ({
  match,
  controller: { availableMatches, selectedMatch },
}: RootState) => ({
  match,
  availableMatches,
  selectedMatch,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      selectMatch: controllerActions.selectMatch,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

const MatchSelector = ({
  availableMatches,
  selectedMatch,
  selectMatch,
}: PropsFromRedux): React.JSX.Element => (
  <div className="control-item">
    <select
      value={selectedMatch || ""}
      onChange={({ target: { value } }) => selectMatch(value)}
    >
      {Object.keys(availableMatches).map((matchKey) => (
        <option value={matchKey} key={matchKey}>
          {availableMatches[matchKey]?.group || matchKey}
        </option>
      ))}
    </select>
  </div>
);

export default connector(MatchSelector);
