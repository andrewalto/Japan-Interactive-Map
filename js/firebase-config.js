/* Firebase project configuration.
   NOTE: these values are NOT secrets — Firebase web configs are designed to be
   public (they ship to every visitor's browser regardless). Access control
   lives in the Firestore security rules, not here. That's why this file is
   committed to the repo instead of hidden in a .env: a static GitHub Pages
   site has no build step to inject environment variables anyway.

   Paste the config object from the Firebase console over the placeholder
   below (Console → Project settings → Your apps → SDK setup and configuration). */

export const firebaseConfig = {
  apiKey: "AIzaSyBJJ1209V9BsfbEICKT9nKQFZ-62cp0V8A",
  authDomain: "japan-trip-map-95b55.firebaseapp.com",
  projectId: "japan-trip-map-95b55",
  storageBucket: "japan-trip-map-95b55.firebasestorage.app",
  messagingSenderId: "577741041882",
  appId: "1:577741041882:web:22f32c569a56407cb035e3",
};

export const isConfigured = firebaseConfig.projectId !== "PASTE_ME";
