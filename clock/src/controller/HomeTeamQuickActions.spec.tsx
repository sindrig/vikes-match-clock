import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import HomeTeamQuickActions from "./HomeTeamQuickActions";
import { Player, Roster } from "../types";
import {
  useController,
  useMatch,
  useView,
} from "../contexts/FirebaseStateContext";
import {
  useLocalState,
  useRemoteSettings,
} from "../contexts/LocalStateContext";
import { MutationRejectedError, MutationSession } from "../lib/mutationSession";
import { getMOTMAsset, getPlayerAssetObject } from "./asset/team/assetHelpers";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useMatch: vi.fn(),
  useView: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
  useRemoteSettings: vi.fn(),
}));

vi.mock("./asset/team/TeamPlayerSelectionModal", () => ({
  default: ({
    open,
    onClose,
    title,
    instruction,
    players,
    onSelect,
    error,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    instruction?: string;
    players: Player[];
    onSelect: (player: Player) => void;
    error?: string | null;
  }) =>
    open ? (
      <div data-testid="player-select-modal">
        {error && <p role="alert">{error}</p>}
        <div data-testid="player-select-title">{title}</div>
        {instruction ? (
          <div data-testid="player-select-instruction">{instruction}</div>
        ) : null}
        <button type="button" onClick={onClose}>
          Close modal
        </button>
        {players.map((player) => (
          <button
            key={`${String(player.number)}-${player.name}`}
            type="button"
            data-testid={`modal-player-${player.name}`}
            onClick={() => onSelect(player)}
          >
            {player.name}
          </button>
        ))}
      </div>
    ) : null,
}));

vi.mock("./asset/team/assetHelpers", () => ({
  getPlayerAssetObject: vi.fn(),
  getMOTMAsset: vi.fn(),
}));

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseView = vi.mocked(useView);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetPlayerAssetObject = vi.mocked(getPlayerAssetObject);
const mockedGetMOTMAsset = vi.mocked(getMOTMAsset);

const mockHomePlayers: Player[] = [
  { name: "Jón Jónsson", id: 101, number: 10, role: "midfielder", show: true },
  { name: "Ólafur Ólafsson", id: 102, number: 7, role: "forward", show: true },
  {
    name: "Siggi Bekkur",
    id: 104,
    number: 12,
    role: "midfielder",
    show: false,
  },
];

const mockAwayPlayers: Player[] = [
  {
    name: "Gunnar Gunnarsson",
    id: 201,
    number: 9,
    role: "forward",
    show: true,
  },
];

const mockRoster: Roster = {
  home: mockHomePlayers,
  away: mockAwayPlayers,
};

function setupMocks(overrides?: {
  roster?: Roster;
  view?: Record<string, unknown>;
}) {
  const mutationSession = new MutationSession({
    location: "vikinni",
    authenticated: true,
    uid: "local-user",
  });
  mutationSession.setFreshness("ready");
  vi.mocked(useLocalState).mockReturnValue({
    listenPrefix: "vikinni",
    mutationSession,
  } as unknown as ReturnType<typeof useLocalState>);
  const mockShowItemNow = vi.fn().mockResolvedValue(undefined);
  const mockAppendSubstitutionAndActivate = vi
    .fn()
    .mockResolvedValue(undefined);
  const mockReplaceQueue = vi.fn().mockResolvedValue("replacement-id");
  const mockEditPlayer = vi.fn();
  const mockCreateQueue = vi
    .fn<(name: string) => string>()
    .mockReturnValue("new-queue-id");
  const mockAddItemsToQueue = vi.fn();
  const mockActivateQueue = vi.fn();

  mockedUseController.mockReturnValue({
    controller: {
      roster: overrides?.roster ?? { home: [], away: [] },
      queues: {},
    },
    showItemNow: mockShowItemNow,
    renderAsset: mockShowItemNow,
    appendSubstitutionAndActivate: mockAppendSubstitutionAndActivate,
    replaceQueue: mockReplaceQueue,
    editPlayer: mockEditPlayer,
    createQueue: mockCreateQueue,
    addItemsToQueue: mockAddItemsToQueue,
    activateQueue: mockActivateQueue,
  } as unknown as ReturnType<typeof useController>);

  mockedUseMatch.mockReturnValue({
    match: { homeTeam: "Víkingur R", awayTeam: "KR" },
  } as unknown as ReturnType<typeof useMatch>);

  mockedUseView.mockReturnValue({
    view: overrides?.view ?? {},
  } as unknown as ReturnType<typeof useView>);

  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);

  return {
    mutationSession,
    mockShowItemNow,
    mockAppendSubstitutionAndActivate,
    mockReplaceQueue,
    mockEditPlayer,
    mockCreateQueue,
    mockAddItemsToQueue,
    mockActivateQueue,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const preparedPlayer = {
  type: "NO_IMAGE_PLAYER",
  key: "prepared",
  name: "Jón Jónsson",
  overlay: { text: "" },
  teamName: "Víkingur R",
};

describe("HomeTeamQuickActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("box placement and home-team scoping", () => {
    it("renders the Heimalið aðgerðir box with all three actions when a home roster is available", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);

      expect(screen.getByText("Heimalið aðgerðir")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Birta leikmann" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Maður leiksins" }),
      ).toBeInTheDocument();
    });

    it("renders nothing when no home roster is available", () => {
      setupMocks();

      render(<HomeTeamQuickActions />);

      expect(screen.queryByText("Heimalið aðgerðir")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Skipting" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("substitution quick action", () => {
    it("does not change either roster flag before media preparation finishes", async () => {
      const {
        mockEditPlayer,
        mockCreateQueue,
        mockAddItemsToQueue,
        mockActivateQueue,
      } = setupMocks({ roster: mockRoster });
      mockedGetPlayerAssetObject.mockReturnValue(new Promise(() => undefined));
      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
      await waitFor(() =>
        expect(mockedGetPlayerAssetObject).toHaveBeenCalled(),
      );
      expect(mockEditPlayer).not.toHaveBeenCalled();
      expect(mockCreateQueue).not.toHaveBeenCalled();
      expect(mockAddItemsToQueue).not.toHaveBeenCalled();
      expect(mockActivateQueue).not.toHaveBeenCalled();
    });

    it("opens the substitution modal with only on-pitch home players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.getByTestId("player-select-title")).toHaveTextContent(
        "Skipting – Víkingur R",
      );
      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "Veldu leikmann sem fer AF velli",
      );
      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Siggi Bekkur"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("lists only eligible off-pitch home players in the second step", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "veldu leikmann sem kemur INN",
      );
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Ólafur Ólafsson"),
      ).not.toBeInTheDocument();
    });

    it("records the substitution and updates player status when both steps complete", async () => {
      const { mockAppendSubstitutionAndActivate } = setupMocks({
        roster: mockRoster,
      });

      const subInAsset = {
        type: "PLAYER",
        key: "sub-in-key",
        name: "Jón",
        number: 10,
      };
      const subOutAsset = {
        type: "PLAYER",
        key: "sub-out-key",
        name: "Siggi",
        number: 12,
      };
      mockedGetPlayerAssetObject
        .mockResolvedValueOnce(
          subInAsset as unknown as Awaited<
            ReturnType<typeof getPlayerAssetObject>
          >,
        )
        .mockResolvedValueOnce(
          subOutAsset as unknown as Awaited<
            ReturnType<typeof getPlayerAssetObject>
          >,
        );

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      await waitFor(() => {
        expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1);
      });

      // Corrected semantics: subIn = coming on, subOut = going off.
      // The first modal step picks the outgoing player (Jón Jónsson), the
      // second the incoming player (Siggi Bekkur).
      expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledWith({
        side: "home",
        outgoing: mockHomePlayers[0],
        incoming: mockHomePlayers[2],
        asset: {
          key: "sub-sub-in-key-sub-out-key",
          type: "SUB",
          subIn: { ...subInAsset, fullName: "Siggi Bekkur" },
          subOut: { ...subOutAsset, fullName: "Jón Jónsson" },
        },
      });
    });
  });

  describe("player-card quick action", () => {
    it("opens the modal with the complete home roster including substituted-off players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("displays the player card when a substituted-off home player is selected", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Siggi",
        number: 12,
      };
      mockedGetPlayerAssetObject.mockResolvedValue(
        playerAsset as unknown as Awaited<
          ReturnType<typeof getPlayerAssetObject>
        >,
      );

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({ name: "Siggi Bekkur" }) as unknown,
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(playerAsset);
      });
    });
  });

  describe("man-of-the-match quick action", () => {
    it("opens the modal with the complete home roster including substituted-off players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Maður leiksins" }));

      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("displays the man-of-the-match asset when a substituted-off home player is selected", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const motmAsset = {
        type: "MOTM",
        key: "motm-key",
        name: "Siggi",
        number: 12,
      };
      mockedGetMOTMAsset.mockResolvedValue(
        motmAsset as unknown as Awaited<ReturnType<typeof getMOTMAsset>>,
      );

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Maður leiksins" }));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      expect(mockedGetMOTMAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({ name: "Siggi Bekkur" }) as unknown,
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(motmAsset);
      });
    });
  });

  describe("modal interaction", () => {
    it("does not revive a substitution's pre-submit session error after media finishes across a venue ABA", async () => {
      const { mutationSession, mockAppendSubstitutionAndActivate } = setupMocks(
        { roster: mockRoster },
      );
      const media =
        deferred<Awaited<ReturnType<typeof getPlayerAssetObject>>>();
      mockedGetPlayerAssetObject.mockReturnValue(media.promise);
      mockAppendSubstitutionAndActivate.mockRejectedValue(
        new MutationRejectedError(),
      );
      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
      mutationSession.setLocation("other");
      mutationSession.setLocation("vikinni");
      mutationSession.setFreshness("ready");
      await act(async () => {
        media.resolve(preparedPlayer);
        await media.promise;
      });
      expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it.each(["success", "dismissal"])(
      "a newer player %s keeps a late substitution failure from resurrecting cleared feedback",
      async (outcome) => {
        const { mockAppendSubstitutionAndActivate } = setupMocks({
          roster: mockRoster,
        });
        const pending = deferred();
        mockAppendSubstitutionAndActivate.mockReturnValue(pending.promise);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
        await waitFor(() =>
          expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1),
        );
        fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
        if (outcome === "success") {
          fireEvent.click(screen.getByTestId("modal-player-Ólafur Ólafsson"));
          await waitFor(() =>
            expect(
              screen.queryByTestId("player-select-modal"),
            ).not.toBeInTheDocument(),
          );
        } else
          fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
        await act(async () => {
          pending.reject(new Error("Old substitution denied"));
          await pending.promise.catch(() => undefined);
        });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      },
    );

    it.each(["Birta leikmann", "Maður leiksins"])(
      "%s keeps its failed write inside the modal and clears feedback on explicit retry",
      async (action) => {
        const { mockShowItemNow } = setupMocks({ roster: mockRoster });
        const retry = deferred();
        mockShowItemNow
          .mockRejectedValueOnce(new Error("PERMISSION_DENIED"))
          .mockReturnValueOnce(retry.promise);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        mockedGetMOTMAsset.mockResolvedValue(preparedPlayer);
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: action }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        const modal = within(screen.getByTestId("player-select-modal"));
        expect(await modal.findByRole("alert")).toHaveTextContent(
          "PERMISSION_DENIED",
        );
        fireEvent.click(modal.getByTestId("modal-player-Jón Jónsson"));
        expect(modal.queryByRole("alert")).not.toBeInTheDocument();
        await waitFor(() => expect(mockShowItemNow).toHaveBeenCalledTimes(2));
        expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
        await act(async () => {
          retry.resolve();
          await retry.promise;
        });
        expect(
          screen.queryByTestId("player-select-modal"),
        ).not.toBeInTheDocument();
      },
    );

    it.each(["success", "failure"])(
      "an old substitution %s cannot replace a newer modal denial, but still submits its independent state work",
      async (outcome) => {
        const { mockShowItemNow, mockAppendSubstitutionAndActivate } =
          setupMocks({ roster: mockRoster });
        const media =
          deferred<Awaited<ReturnType<typeof getPlayerAssetObject>>>();
        mockedGetPlayerAssetObject.mockImplementation(({ player }) =>
          player.id === 101 ? media.promise : Promise.resolve(preparedPlayer),
        );
        if (outcome === "failure")
          mockAppendSubstitutionAndActivate.mockRejectedValue(
            new Error("Leikmannahópur hefur breyst"),
          );
        mockShowItemNow.mockRejectedValue(new Error("PERMISSION_DENIED"));
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
        fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
        fireEvent.click(screen.getByTestId("modal-player-Ólafur Ólafsson"));
        const modal = within(screen.getByTestId("player-select-modal"));
        expect(await modal.findByRole("alert")).toHaveTextContent(
          "PERMISSION_DENIED",
        );
        await act(async () => {
          media.resolve(preparedPlayer);
          await media.promise;
        });
        expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1);
        expect(modal.getByRole("alert")).toHaveTextContent("PERMISSION_DENIED");
      },
    );

    it("shows a current substitution failure and clears it when reopening for explicit retry", async () => {
      const { mockAppendSubstitutionAndActivate } = setupMocks({
        roster: mockRoster,
      });
      mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
      mockAppendSubstitutionAndActivate.mockRejectedValueOnce(
        new Error("Current substitution denied"),
      );
      render(<HomeTeamQuickActions />);
      const selectSub = () => {
        fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
      };
      selectSub();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Current substitution denied",
      );
      expect(
        screen.queryByTestId("player-select-modal"),
      ).not.toBeInTheDocument();
      selectSub();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(2),
      );
    });

    it.each(["dismiss/reopen", "venue ABA", "auth ABA", "unmount"])(
      "retires substitution failure feedback across %s",
      async (boundary) => {
        const { mockAppendSubstitutionAndActivate, mutationSession } =
          setupMocks({ roster: mockRoster });
        const pending = deferred();
        mockAppendSubstitutionAndActivate.mockReturnValue(pending.promise);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        const { unmount } = render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));
        await waitFor(() =>
          expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1),
        );
        if (boundary === "dismiss/reopen") {
          fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
          fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
          fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
        } else if (boundary === "venue ABA") {
          mutationSession.setLocation("other");
          mutationSession.setLocation("vikinni");
          mutationSession.setFreshness("ready");
        } else if (boundary === "auth ABA") {
          mutationSession.setAuth(false);
          mutationSession.setAuth(true, "local-user");
          mutationSession.setFreshness("ready");
        } else unmount();
        await act(async () => {
          pending.reject(new Error("Old substitution denied"));
          await pending.promise.catch(() => undefined);
        });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      },
    );

    it.each(["Birta leikmann", "Maður leiksins"])(
      "retires %s success when dismissed and reopened while its write is pending",
      async (action) => {
        const { mockShowItemNow } = setupMocks({ roster: mockRoster });
        const acknowledgement = deferred();
        mockShowItemNow.mockReturnValue(acknowledgement.promise);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        mockedGetMOTMAsset.mockResolvedValue(preparedPlayer);
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: action }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        await waitFor(() => expect(mockShowItemNow).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
        fireEvent.click(screen.getByRole("button", { name: action }));
        await act(async () => {
          acknowledgement.resolve();
          await acknowledgement.promise;
        });
        expect(screen.getByTestId("player-select-title")).toHaveTextContent(
          action,
        );
      },
    );

    it.each(["success", "failure"])(
      "keeps a newer selection's error after an older %s, then permits retry",
      async (outcome) => {
        const { mockShowItemNow } = setupMocks({ roster: mockRoster });
        const older = deferred();
        mockShowItemNow
          .mockReturnValueOnce(older.promise)
          .mockRejectedValueOnce(new Error("Newer denied"))
          .mockResolvedValue(undefined);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        await waitFor(() => expect(mockShowItemNow).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByTestId("modal-player-Ólafur Ólafsson"));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Newer denied",
        );
        await act(async () => {
          if (outcome === "success") older.resolve();
          else older.reject(new Error("Older denied"));
          await older.promise.catch(() => undefined);
        });
        expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Newer denied");
        fireEvent.click(screen.getByTestId("modal-player-Ólafur Ólafsson"));
        await waitFor(() =>
          expect(
            screen.queryByTestId("player-select-modal"),
          ).not.toBeInTheDocument(),
        );
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      },
    );

    it.each(["dismissal", "replacement", "unmount"])(
      "does not submit media prepared after %s",
      async (boundary) => {
        const { mockShowItemNow } = setupMocks({ roster: mockRoster });
        const media =
          deferred<Awaited<ReturnType<typeof getPlayerAssetObject>>>();
        mockedGetPlayerAssetObject.mockReturnValue(media.promise);
        const { unmount } = render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        if (boundary === "unmount") unmount();
        else if (boundary === "dismissal")
          fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
        else
          fireEvent.click(
            screen.getByRole("button", { name: "Maður leiksins" }),
          );
        await act(async () => {
          media.resolve(preparedPlayer);
          await media.promise;
        });
        expect(mockShowItemNow).not.toHaveBeenCalled();
        if (boundary === "replacement")
          expect(screen.getByTestId("player-select-title")).toHaveTextContent(
            "Maður leiksins",
          );
      },
    );

    it.each(["success", "failure"])(
      "retires submitted %s feedback across a session ABA, without reviving it",
      async (outcome) => {
        const { mockShowItemNow, mutationSession } = setupMocks({
          roster: mockRoster,
        });
        const acknowledgement = deferred();
        mockShowItemNow.mockReturnValue(acknowledgement.promise);
        mockedGetPlayerAssetObject.mockResolvedValue(preparedPlayer);
        render(<HomeTeamQuickActions />);
        fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
        fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
        await waitFor(() => expect(mockShowItemNow).toHaveBeenCalledTimes(1));
        mutationSession.setLocation("other");
        mutationSession.setLocation("vikinni");
        mutationSession.setFreshness("ready");
        await act(async () => {
          if (outcome === "success") acknowledgement.resolve();
          else acknowledgement.reject(new Error("Previous session denied"));
          await acknowledgement.promise.catch(() => undefined);
        });
        expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      },
    );

    it("closes the selection modal without performing an action", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

      expect(
        screen.queryByTestId("player-select-modal"),
      ).not.toBeInTheDocument();
      expect(mockedGetPlayerAssetObject).not.toHaveBeenCalled();
    });
  });
});
