import { useCallback, useState } from "react";
import { addVideosFromPlaylist } from "./YoutubePlaylist";
import { QueueBoard } from "./queue";
import QueuePicker from "./queue/QueuePicker";
import { ASSET_VIEWS } from "../../constants";
import TeamAssetController from "./team/TeamAssetController";
import UrlController from "./UrlController";
import assetTypes from "./AssetTypes";
import { Button, InputNumber, Modal, Toggle } from "rsuite";
import { Asset } from "../../types";
import { parseYoutubePlaylistId, isYoutubeUrl } from "../../utils/urlUtils";

import "./AssetController.css";
import TodaysMatches from "./team/TodaysMatches";
import { useController } from "../../contexts/FirebaseStateContext";

const AssetController = () => {
  const {
    controller,
    selectAssetView,
    createQueue,
    deleteQueue,
    renameQueue,
    reorderQueues,
    addItemsToQueue,
    removeItemFromQueue,
    reorderItemsInQueue,
    updateQueueSettings,
    playQueue,
    stopPlaying,
    showItemNow,
  } = useController();

  const { assetView, queues, activeQueueId, playing } = controller;
  const [pendingAssets, setPendingAssets] = useState<Asset[]>([]);
  const [settingsQueueId, setSettingsQueueId] = useState<string | null>(null);

  const addMultipleAssets = (
    promises: (Asset | Promise<Asset | null>)[],
    { showNow }: { showNow?: boolean } = {},
  ): void => {
    void (async () => {
      const results = await Promise.all(
        promises.map((p) => Promise.resolve(p)),
      );
      const validAssets = results.filter((a): a is Asset => a !== null);

      const [firstAsset] = validAssets;

      if (showNow && firstAsset) {
        showItemNow(firstAsset);
      } else if (validAssets.length > 0) {
        setPendingAssets(validAssets);
      }
    })();
  };

  const addAssetKey = (asset: Asset) => {
    if (asset.type === assetTypes.URL && isYoutubeUrl(asset.key)) {
      const listId = parseYoutubePlaylistId(asset.key);
      if (listId) {
        return addVideosFromPlaylist(listId, addAssetKey);
      }
    }
    return addMultipleAssets([asset]);
  };

  const handleAddToQueue = useCallback(
    (queueId: string, assets: Asset[]) => {
      addItemsToQueue(queueId, assets);
      setPendingAssets([]);
    },
    [addItemsToQueue],
  );

  const handleCreateAndAdd = useCallback(
    (queueName: string, assets: Asset[]) => {
      const newQueueId = createQueue(queueName);
      addItemsToQueue(newQueueId, assets);
      setPendingAssets([]);
    },
    [createQueue, addItemsToQueue],
  );

  const handleSettingsClose = () => {
    setSettingsQueueId(null);
  };

  const settingsQueue = settingsQueueId ? queues[settingsQueueId] : null;

  const renderAssetController = () => {
    return (
      <div className="withborder">
        <div className="controls control-item">
          <UrlController addAsset={addAssetKey} />
        </div>
        <QueueBoard
          queues={queues}
          activeQueueId={activeQueueId}
          playing={playing}
          onRenameQueue={renameQueue}
          onPlayQueue={playQueue}
          onStopPlaying={stopPlaying}
          onOpenSettings={setSettingsQueueId}
          onShowItemNow={showItemNow}
          onDeleteAsset={(queueId, assetKey) =>
            removeItemFromQueue(queueId, assetKey)
          }
          onReorderQueues={reorderQueues}
          onReorderItems={(queueId, newItems) =>
            reorderItemsInQueue(queueId, newItems)
          }
        />
        {pendingAssets.length > 0 && (
          <QueuePicker
            queues={queues}
            assets={pendingAssets}
            onAddToQueue={handleAddToQueue}
            onCreateAndAdd={handleCreateAndAdd}
          />
        )}
        <Modal open={Boolean(settingsQueue)} onClose={handleSettingsClose}>
          {settingsQueue ? (
            <>
              <Modal.Header>
                <Modal.Title>Stillingar biðraðar</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <div className="queue-settings-row">
                  <label>Autoplay</label>
                  <Toggle
                    checked={settingsQueue.autoPlay}
                    onChange={(checked) =>
                      updateQueueSettings(settingsQueue.id, {
                        autoPlay: checked,
                      })
                    }
                  />
                </div>
                {settingsQueue.autoPlay && (
                  <div className="queue-settings-row">
                    <label>Tími</label>
                    <InputNumber
                      min={1}
                      max={600}
                      defaultValue={3}
                      value={settingsQueue.imageSeconds}
                      onChange={(value) => {
                        if (value !== null) {
                          const seconds =
                            typeof value === "string"
                              ? parseInt(value, 10)
                              : value;
                          updateQueueSettings(settingsQueue.id, {
                            imageSeconds: Math.max(1, seconds),
                          });
                        }
                      }}
                      postfix="sek"
                      style={{ width: 110 }}
                    />
                  </div>
                )}
                <div className="queue-settings-row">
                  <label>Loop</label>
                  <Toggle
                    checked={settingsQueue.cycle}
                    onChange={(checked) =>
                      updateQueueSettings(settingsQueue.id, {
                        cycle: checked,
                      })
                    }
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  color="red"
                  appearance="primary"
                  onClick={() => {
                    if (window.confirm("Ertu alveg viss?")) {
                      deleteQueue(settingsQueue.id);
                      handleSettingsClose();
                    }
                  }}
                >
                  Eyða biðröð
                </Button>
                <Button appearance="subtle" onClick={handleSettingsClose}>
                  Loka
                </Button>
              </Modal.Footer>
            </>
          ) : null}
        </Modal>
      </div>
    );
  };
  return (
    <div className="asset-controller">
      {assetView === ASSET_VIEWS.teams && (
        <div className="view-selector">
          <TodaysMatches />
        </div>
      )}
      {assetView === ASSET_VIEWS.assets && renderAssetController()}
      {assetView === ASSET_VIEWS.teams && (
        <TeamAssetController
          previousView={() =>
            setTimeout(() => selectAssetView(ASSET_VIEWS.assets), 500)
          }
        />
      )}
    </div>
  );
};
export default AssetController;
