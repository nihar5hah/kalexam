import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | undefined;

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
      cachedApp = initializeApp({
        credential: cert({
          projectId: parsed.project_id ?? projectId ?? undefined,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }),
      });
      return cachedApp;
    } catch {
      // Fall through to other init methods
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

  // Application Default Credentials (GCP / Firebase hosting / GOOGLE_APPLICATION_CREDENTIALS)
  cachedApp = initializeApp({ projectId: projectId ?? undefined });
  return cachedApp;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
