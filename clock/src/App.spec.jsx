import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import App from "./App";
import { initialState as controllerInitialState } from "./reducers/controller";
import { initialState as matchInitialState } from "./reducers/match";
import { initialState as viewInitialState } from "./reducers/view";
import { initialState as remoteInitialState } from "./reducers/remote";

const mockStore = configureStore([]);

const renderWithStore = (component, store) => {
  return render(<Provider store={store}>{component}</Provider>);
};

it("renders idle view with team selectors", () => {
  const store = mockStore({
    controller: controllerInitialState,
    match: matchInitialState,
    view: viewInitialState,
    remote: remoteInitialState,
    firebase: { auth: { isLoaded: true, isEmpty: true }, data: null },
    listeners: { available: [], screens: [] },
  });
  renderWithStore(<App />, store);

  const teamSelectors = screen.getAllByRole("combobox");
  expect(teamSelectors.length).toBeGreaterThanOrEqual(2);
});

it("renders team asset controller when assetView is teams", () => {
  const store = mockStore({
    controller: {
      ...controllerInitialState,
      assetView: "teams",
    },
    listeners: { available: [], screens: [] },
    firebase: {
      auth: {
        isLoaded: true,
        isEmpty: false,
        email: "fotbolti@vikingur.is",
      },
      data: null,
    },
    match: matchInitialState,
    view: viewInitialState,
    remote: remoteInitialState,
  });
  renderWithStore(<App />, store);

  expect(screen.getByText(/Veldu lið fyrst/i)).toBeInTheDocument();
});
