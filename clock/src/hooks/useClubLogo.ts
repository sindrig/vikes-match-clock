import { useMemo } from "react";
import { useClubOverrides } from "../contexts/FirebaseStateContext";
import clubLogos from "../images/clubLogos";

/**
 * Returns the logo URL for a team name.
 * Checks overrides first, then falls back to bundled logos.
 *
 * @param teamName - The display name of the team (e.g., "Víkingur R")
 * @returns Logo URL or undefined if not found
 */
export const useClubLogo = (teamName: string): string | undefined => {
  const { clubOverrides } = useClubOverrides();

  const override = useMemo(
    () =>
      Object.values(clubOverrides).find((o) => o.name === teamName),
    [clubOverrides, teamName],
  );

  if (override?.logoUrl) {
    return override.logoUrl;
  }

  return (clubLogos as Record<string, string>)[teamName] || undefined;
};

export default useClubLogo;
