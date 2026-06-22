import { env } from "../config/env";

export interface FirebaseWebConfig {
  configured: boolean;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  vapidKey: string;
}

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = env.FIREBASE_WEB_API_KEY;
  const projectId = env.FIREBASE_WEB_PROJECT_ID;
  const messagingSenderId = env.FIREBASE_WEB_MESSAGING_SENDER_ID;
  const appId = env.FIREBASE_WEB_APP_ID;
  const vapidKey = env.FIREBASE_WEB_VAPID_KEY ?? env.VAPID_PUBLIC_KEY;

  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
    return null;
  }

  return {
    configured: true,
    firebase: {
      apiKey,
      authDomain:
        env.FIREBASE_WEB_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket:
        env.FIREBASE_WEB_STORAGE_BUCKET ??
        `${projectId}.firebasestorage.app`,
      messagingSenderId,
      appId,
      measurementId: env.FIREBASE_WEB_MEASUREMENT_ID,
    },
    vapidKey,
  };
}
