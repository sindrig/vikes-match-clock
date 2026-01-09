import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import App from "./App";
import {
  initialState as controllerInitialState,
  TABS,
} from "./reducers/controller";
import { initialState as matchInitialState } from "./reducers/match";
import { initialState as viewInitialState } from "./reducers/view";
import { initialState as remoteInitialState } from "./reducers/remote";
import { initialState as authInitialState } from "./reducers/auth";

const mockStore = configureStore([]);

const renderWithStore = (component, store) => {
  return render(<Provider store={store}>{component}</Provider>);
};

it("renders settings tab with team selectors", () => {
  const store = mockStore({
    controller: {
      ...controllerInitialState,
      tab: TABS.settings,
    },
    match: matchInitialState,
    view: viewInitialState,
    remote: remoteInitialState,
    auth: { ...authInitialState, isLoaded: true, isEmpty: true },
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
    auth: {
      isLoaded: true,
      isEmpty: false,
      email: "fotbolti@vikingur.is",
    },
    match: matchInitialState,
    view: viewInitialState,
    remote: remoteInitialState,
  });
  renderWithStore(<App />, store);

  expect(screen.getByText(/Veldu lið fyrst/i)).toBeInTheDocument();
});
