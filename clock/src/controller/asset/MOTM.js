import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

import bombay from "../../images/bombay.png";

const idxSeconds = [2, 2, 3];

const MOTM = ({ children }) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIdx((idx + 1) % idxSeconds.length);
    }, idxSeconds[idx] * 1000);
    return () => clearTimeout(timer);
  }, [idx]);
  switch (idx) {
    case 0:
      return <div className="motm-container">Maður leiksins í boði...</div>;
    case 1:
      return (
        <div className="motm-container">
          {" "}
          <img src={bombay} alt="bombay" key="bombay" />
        </div>
      );
    case 2:
      return children;
  }
};

MOTM.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]).isRequired,
};
export default MOTM;
