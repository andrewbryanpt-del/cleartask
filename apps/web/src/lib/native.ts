import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Opens the device camera and returns the captured photo as a Blob ready
 * for multipart upload (proof of completion). Returns null if the user
 * cancelled, or when running in a plain browser — web screens should fall
 * back to `<input type="file" accept="image/*" capture>` instead.
 */
export async function captureProofPhoto(): Promise<Blob | null> {
  if (!isNative()) return null;
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 80,
    correctOrientation: true,
  }).catch(() => null);
  if (!photo?.webPath) return null;
  const response = await fetch(photo.webPath);
  return response.blob();
}
