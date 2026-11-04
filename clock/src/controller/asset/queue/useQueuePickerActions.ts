import { useLayoutEffect, useRef, useState } from "react";
import { useController } from "../../../contexts/FirebaseStateContext";
import type { Asset } from "../../../types";
import type { QueuePickerProps } from "./QueuePicker";

type PickerDraft = Omit<QueuePickerProps, "queues">;

// A picker draft owns the commands from the gesture that prepared its media.
// Rerenders after a venue/session change must never retarget those commands.
export function useQueuePickerActions() {
  const { createQueue, addItemsToQueue, renderAsset } = useController();
  const [pending, setPending] = useState<PickerDraft | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true);
  const currentPreparation = useRef(0);
  const latestPrepared = useRef(0);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const selectAssets = (
    inputs: (Asset | Promise<Asset | null>)[],
    { showNow = false }: { showNow?: boolean } = {},
  ): void => {
    const preparation = ++currentPreparation.current;
    const isCurrent = () =>
      active.current && currentPreparation.current === preparation;
    setError("");
    void (async () => {
      try {
        const results = await Promise.all(
          inputs.map((input) => Promise.resolve(input)),
        );
        const assets = results.filter((asset) => asset !== null);
        if (assets.length === 0) return;
        // A ready draft remains usable while a later selection prepares. Once
        // that later selection is ready, an older result cannot replace it.
        if (!active.current || latestPrepared.current > preparation) return;
        latestPrepared.current = preparation;
        if (showNow && assets[0]) {
          await renderAsset(assets[0]);
          return;
        }
        const close = () =>
          setPending((current) => (current === draft ? null : current));
        const draft: PickerDraft = {
          draftId: crypto.randomUUID(),
          assets,
          onClose: close,
          onShowNow: async (items) => {
            await Promise.all(items.map((asset) => renderAsset(asset)));
            close();
          },
          onAddToQueue: async (queueId, items) => {
            await addItemsToQueue(queueId, items);
            close();
          },
          onCreateAndAdd: async (name, items) => {
            await createQueue(name, items);
            close();
          },
        };
        setPending(draft);
      } catch (failure) {
        if (!isCurrent()) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Ekki tókst að undirbúa myndefni.",
        );
      }
    })();
  };

  return { pending, error, selectAssets };
}
