/**
 * Server-side (Admin SDK) version of the YouTube reconstruction cache.
 *
 * The client-SDK youtube-cache.ts cannot be used from API routes because
 * the client SDK has no authenticated user context on the server, causing
 * all Firestore reads/writes to fail against security rules.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

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

export async function readYoutubeReconstructionCacheAdmin(
  videoId: string,
  modelVersion: string,
): Promise<CachedYoutubeReconstruction | null> {
  try {
    const db = getAdminFirestore();
    const ref = db.collection("youtubeCache").doc(cacheDocId(videoId, modelVersion));
    const snapshot = await ref.get();
    if (!snapshot.exists) {
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

export async function writeYoutubeReconstructionCacheAdmin(
  videoId: string,
  modelVersion: string,
  value: Omit<CachedYoutubeReconstruction, "updatedAt">,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    const ref = db.collection("youtubeCache").doc(cacheDocId(videoId, modelVersion));
    await ref.set(
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
