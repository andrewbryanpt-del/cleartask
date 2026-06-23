/**
 * Patches the generated Capacitor android/app/build.gradle for Codemagic CI:
 * - Gradle -PversionCode / -PversionName support
 * - Release signing via CM_KEYSTORE_* env vars
 *
 * Safe to run repeatedly; exits early if already patched.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const gradlePath = resolve(webDir, "android/app/build.gradle");

if (!existsSync(gradlePath)) {
  console.error("[ci] android/app/build.gradle not found — run `npx cap add android` first");
  process.exit(1);
}

let content = readFileSync(gradlePath, "utf8");

if (content.includes("getCiVersionCode")) {
  console.log("[ci] android/app/build.gradle already patched");
  process.exit(0);
}

const helpers = `
def getCiVersionCode = { ->
    return project.hasProperty("versionCode") ? versionCode.toInteger() : 1
}
def getCiVersionName = { ->
    return project.hasProperty("versionName") ? versionName : "1.0"
}
`;

content = helpers + content;

content = content.replace(/versionCode 1/, "versionCode getCiVersionCode()");
content = content.replace(/versionName "1.0"/, 'versionName getCiVersionName()');

content = content.replace(
  /    buildTypes \{/,
  `    signingConfigs {
        release {
            if (System.getenv("CI")) {
                storeFile file(System.getenv("CM_KEYSTORE_PATH"))
                storePassword System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CM_KEY_ALIAS")
                keyPassword System.getenv("CM_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`,
);

content = content.replace(
  /(\s+release \{\n\s+minifyEnabled false)/,
  `$1
            signingConfig signingConfigs.release`,
);

writeFileSync(gradlePath, content);
console.log("[ci] patched android/app/build.gradle for release signing and versioning");
