/* Firebase project configuration.
   NOTE: these values are NOT secrets — Firebase web configs are designed to be
   public (they ship to every visitor's browser regardless). Access control
   lives in the Firestore security rules, not here. That's why this file is
   committed to the repo instead of hidden in a .env: a static GitHub Pages
   site has no build step to inject environment variables anyway.

   Paste the config object from the Firebase console over the placeholder
   below (Console → Project settings → Your apps → SDK setup and configuration). */

export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

export const isConfigured = firebaseConfig.projectId !== "PASTE_ME";
