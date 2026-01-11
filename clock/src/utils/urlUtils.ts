const YOUTUBE_HOSTNAMES = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
];

function isYoutubeHostname(hostname: string): boolean {
  return YOUTUBE_HOSTNAMES.includes(hostname);
}

export function parseYoutubePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isYoutubeHostname(parsed.hostname)) {
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
  try {
    const parsed = new URL(url);
    return isYoutubeHostname(parsed.hostname);
  } catch {
    return false;
  }
}
