import { db } from "./firebase-config.js";
import { ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const $ = (id) => document.getElementById(id);

let playerId = localStorage.getItem("playerId");
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem("playerId", playerId);
}

// Jediný zdroj pravdy pro UI. Každá změna z Firebase -> render().
const state = { game: null, me: null, myAnswer: null };

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("name-input").value.trim();
  if (name) update(ref(db, `players/${playerId}`), { name });
});

document.querySelectorAll(".answer").forEach((btn) => {
  btn.addEventListener("click", () => {
    const { game, myAnswer } = state;
    if (game?.phase !== "question") return;
    set(ref(db, `answers/${game.index}/${playerId}`), Number(btn.dataset.index));
  });
});

onValue(ref(db, `players/${playerId}`), (snap) => {
  state.me = snap.val();
  render();
});

let unsubscribeAnswer = null;
let watchedIndex = null;

onValue(ref(db, "game"), (snap) => {
  state.game = snap.val();
  const index = state.game?.index;

  // Při nové otázce přepneme poslech na odpověď k ní.
  if (index !== watchedIndex) {
    unsubscribeAnswer?.();
    state.myAnswer = null;
    watchedIndex = index;
    if (index !== undefined) {
      unsubscribeAnswer = onValue(ref(db, `answers/${index}/${playerId}`), (s) => {
        state.myAnswer = s.val();
        render();
      });
    }
  }
  render();
});

function show(viewId) {
  ["join", "wait", "play"].forEach((id) => $(id).classList.toggle("hidden", id !== viewId));
}

function render() {
  const { game, me, myAnswer } = state;

  if (!me?.name) {
    $("bar").classList.add("hidden");
    return show("join");
  }

  $("bar").classList.remove("hidden");
  $("me-name").textContent = me.name;
  $("me-score").textContent = `${me.score ?? 0} b.`;

  if (!game || game.phase === "lobby") {
    $("wait-text").textContent = "Jsi ve hře! Čekej na začátek…";
    return show("wait");
  }

  if (game.phase === "end") {
    $("wait-text").textContent = `Konec hry! Máš ${me.score ?? 0} bodů. Výsledky jsou na plátně.`;
    return show("wait");
  }

  show("play");
  $("q-number").textContent = `Otázka ${game.index + 1}`;
  $("q-text").textContent = game.question.q;

  const revealed = game.phase === "reveal";
  const open = game.phase === "question";

  document.querySelectorAll(".answer").forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.querySelector("span").textContent = game.question.answers[i];
    btn.disabled = !open;
    btn.classList.toggle("selected", myAnswer === i && !revealed);
    btn.classList.toggle("correct", revealed && game.correct === i);
    btn.classList.toggle("wrong", revealed && myAnswer === i && game.correct !== i);
  });

  if (revealed) {
    $("feedback").textContent =
      myAnswer === null ? "Nestihl jsi odpovědět" :
      myAnswer === game.correct ? "Správně! +1 bod" : "Špatně!";
  } else if (!open) {
    $("feedback").textContent = "Konečná odpověď? Uvidíme… 🥁";
  } else {
    $("feedback").textContent = myAnswer === null ? "" : "Můžeš ještě změnit do odhalení";
  }
}
