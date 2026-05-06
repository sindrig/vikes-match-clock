import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

import { useView } from "../../contexts/FirebaseStateContext";

// Default flicker settings — car engine sputtering to life
const DEFAULTS = {
  initialOn: 0.03, // seconds
  initialOff: 0.4, // seconds
  onGrowth: 1.2, // multiplier per cycle
  offDecay: 0.82, // multiplier per cycle
  cycles: 16,
  jitter: 0.3, // ±30% randomness per step
};

interface FlickerSettings {
  initialOn: number;
  initialOff: number;
  onGrowth: number;
  offDecay: number;
  cycles: number;
  jitter: number;
}

// Schedule: [on1, off1, on2, off2, ..., onN] — last entry stays permanent
function buildSchedule(settings: FlickerSettings): number[] {
  const schedule: number[] = [];
  let onDuration = settings.initialOn;
  let offDuration = settings.initialOff;

  for (let i = 0; i < settings.cycles; i++) {
    const onJitter = 1 + (Math.random() * 2 - 1) * settings.jitter;
    const offJitter = 1 + (Math.random() * 2 - 1) * settings.jitter;
    schedule.push(onDuration * onJitter * 1000);
    schedule.push(offDuration * offJitter * 1000);
    onDuration *= settings.onGrowth;
    offDuration *= settings.offDecay;
  }
  schedule.push(onDuration * 1000);
  return schedule;
}

interface FlickerState {
  step: number;
  revealed: boolean;
}

type FlickerAction = { type: "advance"; total: number } | { type: "reset" };

function flickerReducer(state: FlickerState, action: FlickerAction) {
  switch (action.type) {
    case "advance": {
      const next = state.step + 1;
      if (next >= action.total - 1) {
        return { step: next, revealed: true };
      }
      return { step: next, revealed: false };
    }
    case "reset":
      return { step: 0, revealed: false };
  }
}

interface GoalScorerRevealProps {
  children: React.ReactNode;
  showNameNumber: boolean;
  nameNumberElement: React.ReactNode;
}

const GoalScorerReveal: React.FC<GoalScorerRevealProps> = ({
  children,
  showNameNumber,
  nameNumberElement,
}) => {
  const {
    view: {
      flickerInitialOn,
      flickerInitialOff,
      flickerOnGrowth,
      flickerOffDecay,
      flickerCycles,
      flickerJitter,
    },
  } = useView();

  const settings: FlickerSettings = useMemo(
    () => ({
      initialOn: flickerInitialOn ?? DEFAULTS.initialOn,
      initialOff: flickerInitialOff ?? DEFAULTS.initialOff,
      onGrowth: flickerOnGrowth ?? DEFAULTS.onGrowth,
      offDecay: flickerOffDecay ?? DEFAULTS.offDecay,
      cycles: flickerCycles ?? DEFAULTS.cycles,
      jitter: flickerJitter ?? DEFAULTS.jitter,
    }),
    [
      flickerInitialOn,
      flickerInitialOff,
      flickerOnGrowth,
      flickerOffDecay,
      flickerCycles,
      flickerJitter,
    ],
  );

  const schedule = useMemo(() => buildSchedule(settings), [settings]);

  const [started, setStarted] = useState(false);

  useEffect(() => {
    const delay = window.setTimeout(() => setStarted(true), 1000);
    return () => window.clearTimeout(delay);
  }, []);

  const [state, dispatch] = useReducer(flickerReducer, {
    step: 0,
    revealed: false,
  });

  const advance = useCallback(() => {
    dispatch({ type: "advance", total: schedule.length });
  }, [schedule.length]);

  useEffect(() => {
    dispatch({ type: "reset" });
  }, [schedule]);

  useEffect(() => {
    if (state.revealed || !started) return;

    const timeout = window.setTimeout(advance, schedule[state.step]);
    return () => window.clearTimeout(timeout);
  }, [state.step, state.revealed, schedule, advance, started]);

  const isVisible = state.revealed || (started && state.step % 2 === 0);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <div
        style={{
          height: "100%",
          width: "100%",
          opacity: isVisible ? 1 : 0,
        }}
      >
        {children}
      </div>
      {state.revealed && showNameNumber && nameNumberElement}
    </div>
  );
};

export default GoalScorerReveal;
