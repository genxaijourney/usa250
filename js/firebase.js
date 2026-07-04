/* USA 250 — Firebase init + anonymous auth
 * -------------------------------------------------------------
 * Web config is PUBLIC by design. Security via Realtime DB rules.
 * -------------------------------------------------------------
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  push,
  child,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCbBPUfn3TAK20KHGQwSZ2BJDBmSAgPjd8",
  authDomain:        "usa250-ea992.firebaseapp.com",
  databaseURL:       "https://usa250-ea992-default-rtdb.firebaseio.com",
  projectId:         "usa250-ea992",
  storageBucket:     "usa250-ea992.firebasestorage.app",
  messagingSenderId: "507265397454",
  appId:             "1:507265397454:web:2592df670bf537f767969f"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    });
  });
}

export { ref, set, get, update, onValue, push, child, remove, serverTimestamp };
