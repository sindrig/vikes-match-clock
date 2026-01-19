import { Component } from "react";
import { Modal, Button, SelectPicker, Loader } from "rsuite";
import axios from "axios";
import apiConfig from "../../../apiConfig";
import { ParsedPlayer } from "./Team";
import { ClubRosterPlayer } from "../../../types";

interface PlayerMatch {
  id: number;
  name: string;
  number: number;
  confidence: number;
  fromRoster?: boolean;
}

interface PlayerSearchResult {
  search_name: string;
  matches: PlayerMatch[];
}

export interface ConfirmedPlayer {
  parsedName: string;
  parsedNumber: number | null;
  ksiId: number | null;
  ksiName: string | null;
  ksiNumber: number | null;
}

interface LineupConfirmModalProps {
  parsedLineup: ParsedPlayer[];
  teamId: number | string;
  group: string | undefined;
  sex: string | undefined;
  clubRoster: Record<string, ClubRosterPlayer>;
  onConfirm: (players: ConfirmedPlayer[]) => void;
  onCancel: () => void;
}

interface LineupConfirmModalState {
  loading: boolean;
  searchResults: PlayerSearchResult[];
  selectedMatches: Record<number, number | null>;
  error: string | null;
}

class LineupConfirmModal extends Component<
  LineupConfirmModalProps,
  LineupConfirmModalState
> {
  state: LineupConfirmModalState = {
    loading: true,
    searchResults: [],
    selectedMatches: {},
    error: null,
  };

  componentDidMount() {
    void this.fetchMatches();
  }

  fuzzyMatch = (a: string, b: string): number => {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/\s+/g, " ").trim();
    const na = normalize(a);
    const nb = normalize(b);

    if (na === nb) return 100;

    const wordsA = na.split(" ");
    const wordsB = nb.split(" ");
    let matchedWords = 0;
    for (const wordA of wordsA) {
      if (
        wordsB.some((wordB) => wordB.includes(wordA) || wordA.includes(wordB))
      ) {
        matchedWords++;
      }
    }
    return Math.round(
      (matchedWords / Math.max(wordsA.length, wordsB.length)) * 100,
    );
  };

  findRosterMatches = (parsedName: string): PlayerMatch[] => {
    const { clubRoster } = this.props;
    const matches: PlayerMatch[] = [];

    for (const [ksiId, player] of Object.entries(clubRoster)) {
      const confidence = this.fuzzyMatch(parsedName, player.name);
      if (confidence >= 50) {
        matches.push({
          id: parseInt(ksiId, 10),
          name: player.name,
          number: player.number || 0,
          confidence,
          fromRoster: true,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  };

  fetchMatches = async () => {
    const { parsedLineup, teamId, group, sex, clubRoster } = this.props;

    const searchResults: PlayerSearchResult[] = [];
    const initialSelections: Record<number, number | null> = {};
    const namesToSearch: string[] = [];
    const searchIndexMap: number[] = [];

    parsedLineup.forEach((player, index) => {
      const rosterMatches = this.findRosterMatches(player.name);
      const firstMatch = rosterMatches[0];

      if (firstMatch && firstMatch.confidence >= 80) {
        searchResults[index] = {
          search_name: player.name,
          matches: rosterMatches,
        };
        initialSelections[index] = firstMatch.id;
      } else {
        namesToSearch.push(player.name);
        searchIndexMap.push(index);
        searchResults[index] = {
          search_name: player.name,
          matches: rosterMatches,
        };
      }
    });

    if (namesToSearch.length === 0) {
      this.setState({
        loading: false,
        searchResults,
        selectedMatches: initialSelections,
      });
      return;
    }

    try {
      const response = await axios.post<{ results: PlayerSearchResult[] }>(
        `${apiConfig.gateWayUrl}match-report/v2?action=batch-search-players&teamId=${teamId}&group=${group || ""}&sex=${sex || ""}`,
        { playerNames: namesToSearch },
      );

      const apiResults = response.data.results;

      apiResults.forEach((result, i) => {
        const originalIndex = searchIndexMap[i];
        if (originalIndex === undefined) return;

        const existingResult = searchResults[originalIndex];
        const existingMatches = existingResult ? existingResult.matches : [];

        const apiMatches: PlayerMatch[] = (result.matches || []).map(
          (m: PlayerMatch) => ({
            ...m,
            fromRoster: false,
          }),
        );

        const existingIds = new Set(existingMatches.map((m) => m.id));
        const newApiMatches = apiMatches.filter((m) => !existingIds.has(m.id));

        searchResults[originalIndex] = {
          search_name: result.search_name,
          matches: [...existingMatches, ...newApiMatches].sort(
            (a, b) => b.confidence - a.confidence,
          ),
        };

        if (!(originalIndex in initialSelections)) {
          const allMatches = searchResults[originalIndex]?.matches || [];
          const topMatch = allMatches[0];
          initialSelections[originalIndex] = topMatch ? topMatch.id : null;
        }
      });

      this.setState({
        loading: false,
        searchResults,
        selectedMatches: initialSelections,
      });
    } catch (err) {
      console.error("Error fetching player matches:", err);

      parsedLineup.forEach((_, index) => {
        if (!(index in initialSelections)) {
          const matches = searchResults[index]?.matches || [];
          const topMatch = matches[0];
          initialSelections[index] = topMatch ? topMatch.id : null;
        }
      });

      this.setState({
        loading: false,
        searchResults,
        selectedMatches: initialSelections,
        error:
          Object.keys(clubRoster).length > 0
            ? null
            : "Villa við að sækja leikmenn. Reyndu aftur.",
      });
    }
  };

  handleSelectionChange = (index: number, value: number | null) => {
    this.setState((prevState) => ({
      selectedMatches: {
        ...prevState.selectedMatches,
        [index]: value,
      },
    }));
  };

  handleConfirm = () => {
    const { parsedLineup, onConfirm } = this.props;
    const { searchResults, selectedMatches } = this.state;

    const confirmedPlayers: ConfirmedPlayer[] = parsedLineup.map((p, index) => {
      const selectedMatchId = selectedMatches[index];
      let selectedMatch: PlayerMatch | undefined;

      if (selectedMatchId && searchResults[index]) {
        selectedMatch = searchResults[index].matches.find(
          (m) => m.id === selectedMatchId,
        );
      }

      return {
        parsedName: p.name,
        parsedNumber: p.number,
        ksiId: selectedMatch ? selectedMatch.id : null,
        ksiName: selectedMatch ? selectedMatch.name : null,
        ksiNumber: selectedMatch ? selectedMatch.number : null,
      };
    });

    onConfirm(confirmedPlayers);
  };

  render() {
    const { onCancel, parsedLineup } = this.props;
    const { loading, searchResults, selectedMatches, error } = this.state;

    return (
      <Modal open={true} onClose={onCancel} size="md">
        <Modal.Header>
          <Modal.Title>Staðfesta liðsskipan</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "20px",
              }}
            >
              <Loader size="lg" content="Leita að leikmönnum..." />
            </div>
          ) : error ? (
            <div style={{ color: "red", padding: "10px" }}>{error}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p>
                Staðfestu pörun leikmanna við KSÍ gagnagrunninn. Veldu réttan
                leikmann úr listanum eða &quot;Engin pörun&quot; ef enginn
                passar.
              </p>
              {parsedLineup.map((player, index) => {
                const result = searchResults[index];
                const matches = result ? result.matches : [];
                const data = matches.map((m) => ({
                  label: m.fromRoster
                    ? `★ ${m.name} (úr liðsskrá) - ${Math.round(m.confidence)}%`
                    : `${m.name} (#${m.number}) - ${Math.round(m.confidence)}%`,
                  value: m.id,
                }));

                data.unshift({
                  label: "Engin pörun",
                  value: 0,
                });

                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>{player.name}</strong>
                      {player.number !== null && (
                        <span style={{ marginLeft: "8px", color: "#666" }}>
                          #{player.number}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <SelectPicker
                        data={data}
                        style={{ width: 300 }}
                        value={selectedMatches[index] || 0}
                        onChange={(val) =>
                          this.handleSelectionChange(
                            index,
                            val === 0 ? null : val,
                          )
                        }
                        cleanable={false}
                        searchable
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.handleConfirm} appearance="primary">
            Staðfesta
          </Button>
          <Button onClick={onCancel} appearance="subtle">
            Hætta við
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

export default LineupConfirmModal;
