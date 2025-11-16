import React from "react";

import "./MatchController.css";

interface ControlButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
  big?: boolean;
  disabled?: boolean;
}

const ControlButton: React.FC<ControlButtonProps> = ({ 
  children, 
  className = "", 
  onClick, 
  big = false, 
  disabled = false 
}) => (
  <div className={`match-controller-button-wrapper ${big ? "big" : ""}`}>
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  </div>
);

export default ControlButton;
