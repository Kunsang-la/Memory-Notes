// services/musicService.ts

export interface Track {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  albumArtUrl: string;
}

export const searchMusic = async (query: string): Promise<Track[]> => {
  if (!query.trim()) return [];

  try {
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`
    );

    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = await response.json();

    return data.results.map((item: any) => ({
      id: item.trackId.toString(),
      title: item.trackName,
      artist: item.artistName,
      audioUrl: item.previewUrl,
      albumArtUrl: item.artworkUrl100,
    }));
  } catch (error) {
    console.error('Failed to search music:', error);
    return [];
  }
};