export const THUMB_VP = {
  height: 50,
  width: 100,
} as const;

export enum Sports {
  Football = "football",
  Handball = "handball",
}

export const HALFSTOPS: Record<Sports, Record<number, number[]>> = {
  [Sports.Football]: {
    35: [35, 70, 80, 90],
    40: [40, 80, 90, 100],
    45: [45, 90, 105, 120],
  },
  [Sports.Handball]: {
    15: [15, 30, 33, 36],
    20: [20, 40, 45, 50],
    25: [25, 50, 55, 60],
    30: [30, 60, 65, 70],
  },
};

export const DEFAULT_HALFSTOPS: Record<Sports, number[]> = {
  [Sports.Football]: HALFSTOPS[Sports.Football][45] as number[],
  [Sports.Handball]: HALFSTOPS[Sports.Handball][30] as number[],
};

export const PENALTY_LENGTH = 2 * 60 * 1000;
export const TIMEOUT_LENGTH = 60000;
