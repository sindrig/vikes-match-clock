import React from "react";
import { getBackground } from "../../constants";
import { useView } from "../../contexts/FirebaseStateContext";

import "./Substitution.css";

interface OwnProps {
  children: React.ReactNode[];
  thumbnail?: boolean;
}

type Props = OwnProps;

const Substitution = ({
  children,
  thumbnail = false,
}: Props): React.JSX.Element => {
  const {
    view: { vp, background },
  } = useView();

  if (Array.isArray(children) && children.length !== 2) {
    console.error("Children should have length 2, received ", children);
  }
  const style: React.CSSProperties = {
    ...vp.style,
    ...getBackground(background),
  };
  return (
    <div
      className={`asset-substitution${thumbnail ? " thumbnail" : ""}`}
      style={style}
    >
      {children}
    </div>
  );
};

export default Substitution;
