import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | undefined;

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function getAdminApp(): App {
  if (cachedApp) {
    return cachedApp;
  }

  const existing = getApps();
  if (existing.length) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields");
      }
      cachedApp = initializeApp({
        credential: cert({
          projectId: parsed.project_id ?? projectId ?? undefined,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }),
      });
      return cachedApp;
    } catch (error) {
      if (isProductionEnv()) {
        throw new Error(
          `Invalid FIREBASE_SERVICE_ACCOUNT_KEY configuration: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }

      console.warn("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY is invalid, falling back", {
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (privateKey && clientEmail && projectId) {
    cachedApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    return cachedApp;
  }

  if (isProductionEnv() && (privateKey || clientEmail)) {
    throw new Error(
      "Incomplete Firebase Admin credential env vars: FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID are all required",
    );
  }

  // Application Default Credentials (GCP / Firebase hosting / GOOGLE_APPLICATION_CREDENTIALS)
  cachedApp = initializeApp({ projectId: projectId ?? undefined });
  return cachedApp;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
