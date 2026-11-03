import { db } from "./firebase-config.js";
import { ref, onValue, set, update, get, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { QUESTIONS } from "./questions.js";

const $ = (id) => document.getElementById(id);
const LETTERS = ["A", "B", "C", "D"];
const SUSPENSE_MS = 2000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { game: null, players: {}, answers: {} };
let busy = false;

// ---------- Připojení hráčů ----------
const joinUrl = new URL("play.html", location.href).href;
$("join-url").textContent = joinUrl;
$("qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(joinUrl)}`;

// ---------- Akce moderátora (zapisují do Firebase) ----------
async function showQuestion(index) {
  const { q, answers } = QUESTIONS[index];
  await set(ref(db, "game"), { phase: "question", index, question: { q, answers } });
}

async function reveal() {
  const { index } = state.game;
  await update(ref(db, "game"), { phase: "locked" });
  await wait(SUSPENSE_MS);

  const correct = QUESTIONS[index].correct;
  const snap = await get(ref(db, `answers/${index}`));
  const updates = { "game/phase": "reveal", "game/correct": correct };
  snap.forEach((child) => {
    if (child.val() === correct) updates[`players/${child.key}/score`] = increment(1);
  });
  await update(ref(db), updates);
}

async function finish() {
  await update(ref(db, "game"), { phase: "end" });
}

async function newGame() {
  const updates = { game: { phase: "lobby" }, answers: null };
  Object.keys(state.players).forEach((id) => (updates[`players/${id}/score`] = 0));
  await update(ref(db), updates);
}

async function wipeAll() {
  await set(ref(db), { game: { phase: "lobby" } });
}

// Hlavní tlačítko dělá vždy "další logický krok" podle fáze
function mainAction() {
  const g = state.game;
  const phase = g?.phase ?? "lobby";
  if (phase === "lobby") return showQuestion(0);
  if (phase === "question") return reveal();
  if (phase === "reveal") return g.index + 1 < QUESTIONS.length ? showQuestion(g.index + 1) : finish();
  if (phase === "end") return newGame();
}

async function run(action) {
  if (busy) return;
  busy = true;
  render();
  try {
    await action();
  } finally {
    busy = false;
    render();
  }
}

$("main-btn").addEventListener("click", () => run(mainAction));
$("reset-btn").addEventListener("click", () => confirm("Vynulovat body a začít znovu?") && run(newGame));
$("wipe-btn").addEventListener("click", () => confirm("Smazat všechny hráče a začít úplně od začátku?") && run(wipeAll));
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    run(mainAction);
  }
});

// ---------- Poslech Firebase ----------
onValue(ref(db, "players"), (snap) => {
  state.players = snap.val() ?? {};
  render();
});

let unsubscribeAnswers = null;
let watchedIndex = null;

onValue(ref(db, "game"), (snap) => {
  state.game = snap.val();
  const index = state.game?.index;
  if (index !== watchedIndex) {
    unsubscribeAnswers?.();
    state.answers = {};
    watchedIndex = index;
    if (index !== undefined) {
      unsubscribeAnswers = onValue(ref(db, `answers/${index}`), (s) => {
        state.answers = s.val() ?? {};
        render();
      });
    }
  }
  render();
});

// ---------- Vykreslení ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

function sortedPlayers() {
  return Object.values(state.players)
    .filter((p) => p.name)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function render() {
  const g = state.game;
  const phase = g?.phase ?? "lobby";
  const players = sortedPlayers();

  const labels = {
    lobby: "Začít hru ▶",
    question: "Odhalit odpověď",
    locked: "Konečná odpověď…",
    reveal: g && g.index + 1 < QUESTIONS.length ? "Další otázka ▶" : "Výsledky 🏆",
    end: "Nová hra",
  };
  $("main-btn").textContent = labels[phase];
  $("main-btn").disabled = busy || phase === "locked";

  if (phase === "lobby") {
    showScreen("lobby-screen");
    $("player-count").textContent = players.length;
    $("player-list").innerHTML = players.map((p) => `<li>${escape(p.name)}</li>`).join("");
    return;
  }

  if (phase === "end") {
    showScreen("end-screen");
    const medals = ["🥇", "🥈", "🥉"];
    $("leaderboard").innerHTML = players
      .map((p, i) => `<li style="animation-delay:${(players.length - i) * 0.4}s">
        <span>${medals[i] ?? i + 1 + "."} ${escape(p.name)}</span><b>${p.score ?? 0} b.</b></li>`)
      .join("");
    return;
  }

  showScreen("game-screen");
  const revealed = phase === "reveal";
  $("question").textContent = g.question.q;
  document.querySelector(".stage").classList.toggle("locked", phase === "locked");

  const votes = [0, 0, 0, 0];
  Object.values(state.answers).forEach((a) => votes[a]++);
  const answeredCount = Object.keys(state.answers).length;

  document.querySelectorAll(".answer").forEach((el) => {
    const i = Number(el.dataset.index);
    el.querySelector(".text").textContent = g.question.answers[i];
    el.querySelector(".votes").textContent = revealed ? votes[i] : "";
    el.classList.toggle("correct", revealed && g.correct === i);
    el.classList.toggle("dim", revealed && g.correct !== i);
  });

  $("answered-count").textContent = revealed ? "" : `Odpovědělo ${answeredCount} / ${players.length}`;

  $("chart").classList.toggle("hidden", !revealed);
  if (revealed) {
    const max = Math.max(1, ...votes);
    $("chart").innerHTML = votes
      .map((v, i) => `<div class="bar ${g.correct === i ? "correct" : ""}">
        <b>${v}</b><div class="fill" style="height:${(v / max) * 80}%"></div><span>${LETTERS[i]}</span></div>`)
      .join("");
  }

  $("ladder").innerHTML = QUESTIONS.map((_, i) => {
    const cls = i === g.index ? "current" : i < g.index ? "done" : "";
    return `<li class="${cls}"><span>${i + 1}</span><span>1 bod</span></li>`;
  }).join("");

  $("top-players").innerHTML = players
    .slice(0, 5)
    .map((p) => `<li>${escape(p.name)} <span>${p.score ?? 0}</span></li>`)
    .join("");
}
