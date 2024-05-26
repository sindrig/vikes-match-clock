import React from "react";
import { useDrop } from "react-dnd";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import TrashIcon from "@rsuite/icons/Trash";
import controllerActions from "../../actions/controller";

const assetItemType = "asset";

const RemoveAssetDropzone = ({ removeAsset }) => {
  const [{ handlerId }, drop] = useDrop({
    accept: assetItemType,
    drop: ({ asset }) => {
      console.log(asset);
      removeAsset(asset);
    },
  });
  return (
    <div ref={drop} data-handler-id={handlerId}>
      <TrashIcon style={{ fontSize: "10em" }} />
    </div>
  );
};

RemoveAssetDropzone.propTypes = {
  removeAsset: PropTypes.func.isRequired,
};

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      removeAsset: controllerActions.removeAsset,
    },
    dispatch,
  );

export default connect(null, dispatchToProps)(RemoveAssetDropzone);
