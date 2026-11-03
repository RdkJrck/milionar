import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp({
  databaseURL: "https://millionar-default-rtdb.europe-west1.firebasedatabase.app",
});

export const db = getDatabase(app);
