export function parseYoutubePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("youtube")) {
      return null;
    }
    if (parsed.pathname !== "/playlist") {
      return null;
    }
    const listId = parsed.searchParams.get("list");
    return listId || null;
  } catch {
    return null;
  }
}

export function isYoutubeUrl(url: string): boolean {
  return url.includes("youtube") || url.includes("youtu.be");
}
