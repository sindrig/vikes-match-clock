import React from "react";
import { render } from "@testing-library/react";
import { LocalStateProvider } from "./contexts/LocalStateContext";
import { FirebaseStateProvider } from "./contexts/FirebaseStateContext";
import App from "./App";

it("renders without crashing", () => {
  const { container } = render(
    <LocalStateProvider>
      <FirebaseStateProvider listenPrefix="" isAuthenticated={false}>
        <App />
      </FirebaseStateProvider>
    </LocalStateProvider>,
  );

  expect(container).toBeInTheDocument();
});

it("renders with Context providers instead of Redux", () => {
  const { container } = render(
    <LocalStateProvider>
      <FirebaseStateProvider listenPrefix="" isAuthenticated={false}>
        <App />
      </FirebaseStateProvider>
    </LocalStateProvider>,
  );

  expect(container.firstChild).toBeInTheDocument();
});
