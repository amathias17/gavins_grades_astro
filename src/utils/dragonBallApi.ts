const API_BASE_URL = "https://dragonball-api.com/api";

export interface DragonBallCharacter {
  id: number;
  name: string;
  image: string;
  affiliation?: string;
  race?: string;
  gender?: string;
  description?: string;
  originPlanet?: DragonBallPlanet;
  transformations?: DragonBallTransformation[];
}

export interface DragonBallPlanet {
  id: number;
  name: string;
  isDestroyed?: boolean;
  description?: string;
  image?: string;
}

export interface DragonBallTransformation {
  id: number;
  name: string;
  image: string;
  ki?: string;
}

export type DragonBallFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asCharacter(value: unknown): DragonBallCharacter {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.name !== "string" || typeof value.image !== "string") {
    throw new Error("Dragon Ball API returned an invalid character");
  }

  return value as unknown as DragonBallCharacter;
}

async function getJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Dragon Ball API request failed with ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function fetchDragonBallCharacter(id: number, fetcher: DragonBallFetch = fetch): Promise<DragonBallCharacter> {
  const response = await fetcher(`${API_BASE_URL}/characters/${id}`);
  return asCharacter(await getJson(response));
}

export async function fetchDragonBallCharacters(fetcher: DragonBallFetch = fetch): Promise<DragonBallCharacter[]> {
  const characters: DragonBallCharacter[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetcher(`${API_BASE_URL}/characters?page=${page}&limit=100`);
    const payload = await getJson(response);
    if (!isRecord(payload) || !Array.isArray(payload.items)) throw new Error("Dragon Ball API returned an invalid character list");

    characters.push(...payload.items.map(asCharacter));
    const meta = isRecord(payload.meta) ? payload.meta : undefined;
    totalPages = typeof meta?.totalPages === "number" ? meta.totalPages : page;
    page += 1;
  }

  return characters;
}

export async function fetchBadgeCharacterArtwork(
  characterIds: number[],
  fetcher: DragonBallFetch = fetch,
): Promise<Map<number, string>> {
  const artwork = new Map<number, string>();
  const results = await Promise.all(characterIds.map(async (id) => {
    try {
      const character = await fetchDragonBallCharacter(id, fetcher);
      return [id, character.image] as const;
    } catch {
      return null;
    }
  }));

  results.forEach((result) => {
    if (result) artwork.set(result[0], result[1]);
  });

  return artwork;
}
