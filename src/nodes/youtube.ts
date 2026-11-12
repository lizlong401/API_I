export type YouTubeVideo = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  watchUrl: string;
  embedUrl: string;
};

type RequestOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export class YouTubeError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "YouTubeError";
    this.status = status;
  }
}

/** Text in → highest-ranked embeddable video metadata out; null if no match. */
export async function searchYTB(
  text: string,
  options: RequestOptions = {},
): Promise<YouTubeVideo | null> {
  if (typeof text !== "string" || !text.trim()) {
    throw new YouTubeError("Enter some text to search YouTube");
  }

  const data = await youtubeRequest("search", {
    part: "snippet",
    q: text.trim(),
    type: "video",
    maxResults: "1",
    order: "relevance",
    videoEmbeddable: "true",
    videoSyndicated: "true",
  }, options);

  const item = data.items[0];
  if (!item) {
    return null;
  }

  const videoId = item.id?.videoId;
  const snippet = item.snippet;
  if (
    typeof videoId !== "string" ||
    !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
    typeof snippet?.title !== "string" ||
    typeof snippet?.channelTitle !== "string"
  ) {
    throw new YouTubeError("YouTube returned invalid video metadata");
  }

  const thumbnail = snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url;
  return {
    videoId,
    title: snippet.title,
    description: typeof snippet.description === "string" ? snippet.description : "",
    channelTitle: snippet.channelTitle,
    thumbnailUrl: typeof thumbnail === "string" ? thumbnail : null,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
  };
}

export async function healthCheck(options: RequestOptions = {}) {
  try {
    await youtubeRequest("channels", {
      part: "id",
      forHandle: "@GoogleDevelopers",
    }, options);
    return { ok: true, status: 200 };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof YouTubeError ? error.status : undefined,
      error: error instanceof Error ? error.message : "YouTube health check failed",
    };
  }
}

// Shared request handling for search and health checks.
async function youtubeRequest(
  resource: string,
  params: Record<string, string>,
  options: RequestOptions = {},
) {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  if (!apiKey?.trim()) {
    throw new YouTubeError("Missing YOUTUBE_API_KEY in .env");
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", apiKey);

  const sendRequest = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await sendRequest(url, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new YouTubeError("YouTube request timed out or could not connect");
  }

  if (!response.ok) {
    // Do not include request URLs or credentials in errors.
    const messages: Record<number, string> = {
      400: "YouTube rejected the request. Check your API key and search input.",
      401: "YouTube authentication failed. Check your API key.",
      403: "YouTube access denied. Check API enablement, key restrictions, and quota.",
      429: "YouTube rate limit reached. Try again later.",
    };
    const message = messages[response.status] ?? `YouTube request failed (${response.status})`;
    throw new YouTubeError(message, response.status);
  }

  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
      throw new Error("Invalid response");
    }
    return data;
  } catch {
    throw new YouTubeError("YouTube returned an invalid or incomplete response");
  }
}

