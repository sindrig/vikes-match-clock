import { connect, ConnectedProps } from "react-redux";
import { getBackground } from "../../reducers/view";
import { RootState } from "../../types";

import "./Substitution.css";

interface OwnProps {
  children: React.ReactNode[];
  thumbnail?: boolean;
}

const mapStateToProps = ({ view: { vp, background } }: RootState) => ({
  vp,
  background,
});

const connector = connect(mapStateToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

type Props = PropsFromRedux & OwnProps;

const Substitution = ({
  children,
  thumbnail = false,
  vp,
  background,
}: Props): React.JSX.Element => {
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

export default connector(Substitution);
