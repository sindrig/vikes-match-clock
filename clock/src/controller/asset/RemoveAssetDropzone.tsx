import { useDrop } from "react-dnd";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";
import TrashIcon from "@rsuite/icons/Trash";
import controllerActions from "../../actions/controller";
import { Asset } from "../../types";

const assetItemType = "asset";

interface DragItem {
  asset: Asset;
}

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      removeAsset: controllerActions.removeAsset,
    },
    dispatch,
  );

const connector = connect(null, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

const RemoveAssetDropzone = ({
  removeAsset,
}: PropsFromRedux): React.JSX.Element => {
  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: assetItemType,
    drop: ({ asset }: DragItem) => {
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

export default connector(RemoveAssetDropzone);
