import React, { Component } from "react";
import PropTypes from "prop-types";
import assetTypes from "./AssetTypes";

export default class FreeTextController extends Component {
  static propTypes = {
    addAsset: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.addUrlAsset = this.addUrlAsset.bind(this);
    this.onTextChange = this.onTextChange.bind(this);
  }

  state = {
    value: "",
    error: "",
  };

  onTextChange(e) {
    const {
      target: { value },
    } = e;
    this.setState({ value });
  }

  addUrlAsset() {
    const { addAsset } = this.props;
    const { value } = this.state;
    const asset = { type: assetTypes.FREE_TEXT, key: value };
    this.setState({ value: "", error: "" });
    return addAsset(asset);
  }

  render() {
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
        <button type="button" onClick={this.addUrlAsset}>
          Bæta við
        </button>
        <span>{error}</span>
      </div>
    );
  }
}
