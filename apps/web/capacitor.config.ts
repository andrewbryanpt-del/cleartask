import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.com.cleartask.app",
  appName: "ClearTask",
  webDir: "dist",
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
