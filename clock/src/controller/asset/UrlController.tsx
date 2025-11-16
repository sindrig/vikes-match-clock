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

export default class UrlController extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.addUrlAsset = this.addUrlAsset.bind(this);
    this.onTextChange = this.onTextChange.bind(this);
  }

  state: State = {
    value: "",
    error: "",
  };

  onTextChange(e: ChangeEvent<HTMLInputElement>): void {
    const {
      target: { value },
    } = e;
    this.setState({ value });
  }

  addUrlAsset(): void {
    const { addAsset } = this.props;
    const { value } = this.state;
    if (value !== "ruv") {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
      } catch (e) {
        this.setState({ error: `"${value}" is not a valid url` });
        return;
      }
    }
    const asset: Asset = { type: assetTypes.URL, key: value };
    this.setState({ value: "", error: "" });
    addAsset(asset);
  }

  render(): React.JSX.Element {
    const { value, error } = this.state;
    return (
      <div>
        Url:{" "}
        <input
          type="text"
          onChange={this.onTextChange}
          value={value}
          style={{ width: "95px" }}
        />
        <Button appearance="default" type="button" onClick={this.addUrlAsset}>
          Bæta við
        </Button>
        <span>{error}</span>
      </div>
    );
  }
}
