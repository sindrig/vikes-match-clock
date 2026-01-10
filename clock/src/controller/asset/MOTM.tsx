import { useState, useEffect } from "react";

import bombay from "../../images/bombay.png";

const idxSeconds = [2, 2, 3];

interface MOTMProps {
  children: React.ReactNode;
}

const MOTM = ({ children }: MOTMProps): React.JSX.Element | null => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const seconds = idxSeconds[idx] || 2;
    const timer = setTimeout(() => {
      setIdx((Number(idx) + 1) % idxSeconds.length);
    }, seconds * 1000);
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
      return <>{children}</>;
    default:
      return null;
  }
};

export default MOTM;
