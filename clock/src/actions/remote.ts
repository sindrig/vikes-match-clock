import { createAction, Action } from "redux-actions";

interface ActionCreators {
  setEmail: (email: string) => Action<{ email: string }>;
  setPassword: (password: string) => Action<{ password: string }>;
  setSync: (sync: boolean) => Action<{ sync: boolean }>;
  setListenPrefix: (listenPrefix: string) => Action<{ listenPrefix: string }>;
}

const actionPayloads: Record<
  string,
  ((...args: never[]) => unknown) | undefined
> = {
  setEmail: (email: string) => ({ email }),
  setPassword: (password: string) => ({ password }),
  setSync: (sync: boolean) => ({ sync }),
  setListenPrefix: (listenPrefix: string) => ({ listenPrefix }),
};

const actionCreators: Record<string, any> = {};

Object.keys(actionPayloads).forEach((key) => {
  const payloadFn = actionPayloads[key];
  actionCreators[key] = payloadFn
    ? createAction(key, payloadFn as any)
    : createAction(key);
});

export default actionCreators as unknown as ActionCreators;
