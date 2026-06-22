export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface PushWebConfig {
  configured: boolean;
  firebase: FirebaseClientConfig;
  vapidKey: string;
}

/** Build config from Vite env vars (local dev fallback). */
export function configFromEnv(): PushWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
    return null;
  }

  return {
    configured: true,
    firebase: {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
      projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId,
      appId,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    },
    vapidKey,
  };
}
