import { createAction, Action } from "redux-actions";
import { persistor } from "../store";

interface ActionCreators {
  clearState: () => Action<Promise<void>>;
}

const actionPayloads: Record<
  string,
  ((...args: never[]) => unknown) | undefined
> = {
  clearState: () => persistor.purge(),
};

const actionCreators: Record<string, unknown> = {};

Object.keys(actionPayloads).forEach((key) => {
  const payloadFn = actionPayloads[key];
  actionCreators[key] = payloadFn
    ? createAction(key, payloadFn as (...args: never[]) => unknown)
    : createAction(key);
});

export default actionCreators as unknown as ActionCreators;
