import "@testing-library/jest-dom";

jest.mock("./lib/weather", () => ({
  getTemp: () => new Promise((resolve) => resolve(10)),
}));

jest.mock("redux-actions", () => ({
  createAction: (type) => (payload) => ({ type, payload }),
  handleActions: (handlers, initialState) => (state = initialState, action) => {
    const handler = handlers[action.type];
    if (handler && handler.next) {
      return handler.next(state, action);
    }
    return state;
  },
}));

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock("compress.js", () => {
  return jest.fn().mockImplementation(() => ({
    compress: jest.fn(() => Promise.resolve([{ data: "mock" }])),
  }));
});

jest.mock("react-drag-drop-files", () => ({
  FileUploader: ({ children }) => children,
}));
