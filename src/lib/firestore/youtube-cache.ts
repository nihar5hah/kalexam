import { doc, getDoc, setDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

type TranscriptSource = "captions" | "ai-reconstructed";

type YouTubeMetadata = {
  title: string;
  author?: string;
  thumbnailUrl?: string;
  description?: string;
  chapters: string[];
  tags: string[];
};

type CachedChunk = {
  text: string;
  section: string;
};

export type CachedYoutubeReconstruction = {
  videoId: string;
  modelVersion: string;
  title: string;
  channel?: string;
  transcriptSource: TranscriptSource;
  originalLanguage?: "english" | "hindi" | "other";
  translatedToEnglish?: boolean;
  summary?: string;
  rawTranscript?: string;
  translatedTranscript?: string;
  youtubeMetadata: YouTubeMetadata;
  chunks: CachedChunk[];
  updatedAt: number;
};

function cacheDocId(videoId: string, modelVersion: string): string {
  const normalizedModel = modelVersion.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64);
  return `${videoId}-${normalizedModel}`;
}

export async function readYoutubeReconstructionCache(
  videoId: string,
  modelVersion: string,
): Promise<CachedYoutubeReconstruction | null> {
  try {
    const db = getFirebaseDb();
    const ref = doc(db, "youtubeCache", cacheDocId(videoId, modelVersion));
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as CachedYoutubeReconstruction;
    if (!data?.chunks?.length) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export async function writeYoutubeReconstructionCache(
  videoId: string,
  modelVersion: string,
  value: Omit<CachedYoutubeReconstruction, "updatedAt">,
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const ref = doc(db, "youtubeCache", cacheDocId(videoId, modelVersion));
    await setDoc(
      ref,
      {
        ...value,
        videoId,
        modelVersion,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch {
    // best-effort cache write
  }
}
