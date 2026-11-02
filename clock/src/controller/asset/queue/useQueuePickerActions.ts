import { useState } from "react";
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

  const selectAssets = (
    inputs: (Asset | Promise<Asset | null>)[],
    { showNow = false }: { showNow?: boolean } = {},
  ): void => {
    setError("");
    void (async () => {
      try {
        const results = await Promise.all(
          inputs.map((input) => Promise.resolve(input)),
        );
        const assets = results.filter((asset) => asset !== null);
        if (assets.length === 0) return;
        if (showNow && assets[0]) {
          await renderAsset(assets[0]);
          return;
        }
        const close = () =>
          setPending((current) => (current === draft ? null : current));
        const draft: PickerDraft = {
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
