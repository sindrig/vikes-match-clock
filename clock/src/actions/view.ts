import { createAction, Action } from "redux-actions";
import { ViewPort } from "../types";

interface ActionCreators {
  setViewPort: (vp: ViewPort) => Action<{ vp: ViewPort }>;
  setBackground: (background: string) => Action<{ background: string }>;
  setIdleImage: (idleImage: string) => Action<{ idleImage: string }>;
}

const actionPayloads: Record<string, ((...args: any[]) => any) | undefined> = {
  setViewPort: (vp: ViewPort) => ({ vp }),
  setBackground: (background: string) => ({ background }),
  setIdleImage: (idleImage: string) => ({ idleImage }),
};

const actionCreators: Record<string, any> = {};

Object.keys(actionPayloads).forEach((key) => {
  const payloadFn = actionPayloads[key];
  actionCreators[key] = payloadFn
    ? createAction(key, payloadFn as any)
    : createAction(key);
});

export default actionCreators as unknown as ActionCreators;
