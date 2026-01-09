import { Component, ChangeEvent } from "react";
import assetTypes from "./AssetTypes";
import Button from "rsuite/Button";
import { Asset } from "../../types";

interface Props {
  addAsset: (asset: Asset) => void;
}

interface State {
  value: string;
  error: string;
}

export default class FreeTextController extends Component<Props, State> {
  state: State = {
    value: "",
    error: "",
  };

  onTextChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const {
      target: { value },
    } = e;
    this.setState({ value });
  };

  addTextAsset = (): void => {
    const { addAsset } = this.props;
    const { value } = this.state;
    const asset: Asset = { type: assetTypes.FREE_TEXT, key: value };
    this.setState({ value: "", error: "" });
    addAsset(asset);
  };

  render(): React.JSX.Element {
    const { value, error } = this.state;
    return (
      <div>
        Frjáls texti:{" "}
        <input
          type="text"
          onChange={this.onTextChange}
          value={value}
          style={{ width: "95px" }}
        />
        <Button appearance="default" type="button" onClick={this.addTextAsset}>
          Bæta við
        </Button>
        <span>{error}</span>
      </div>
    );
  }
}
