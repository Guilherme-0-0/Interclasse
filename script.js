// Sistema Interclasse: login, times, chave eliminatória, placar, ranking.
// Moderno: let/const, async/await, persistência local.

const $ = (s) => document.querySelector(s);
const qs = (s) => Array.from(document.querySelectorAll(s));

/* ---------- Util ---------- */
const hashText = async (text) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const saveState = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadState = (k, fallback) => {
  const v = localStorage.getItem(k);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};
const toast = (msg, selector) => {
  if (!selector) return;
  const el = $(selector);
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 2500);
};

/* ---------- Estado global ---------- */
let teams = loadState("inter_teams", []);
let bracket = loadState("inter_bracket", null);
let results = loadState("inter_results", {});
let adminSession = loadState("inter_admin_session", null);

/* ---------- Elementos comuns ---------- */
const spectatorBtn = $("#spectator-btn");
const adminBtn = $("#admin-btn");
const spectatorSection = $("#spectator-section");
const adminPanel = $("#admin-panel");
const adminLoginSection = $("#admin-login-section");

const teamListEl = $("#team-list");
const rankingTableBody = $("#ranking-table tbody");
const bracketContainer = $("#bracket");
const liveMatchesEl = $("#live-matches");

const loginBtn = $("#login-btn");
const registerAdminBtn = $("#register-admin-btn");
const logoutBtn = $("#logout-btn");
const adminEmailInput = $("#admin-email");
const adminPasswordInput = $("#admin-password");
const adminMsg = $("#admin-msg");

const addTeamBtn = $("#add-team-btn");
const teamNameInput = $("#team-name");
const teamCoachInput = $("#team-coach");
const teamMsg = $("#team-msg");
const generateBracketBtn = $("#generate-bracket-btn");
const resetBracketBtn = $("#reset-bracket-btn");
const syncBtn = $("#sync-btn");

const participantsWrapper = $("#participants-wrapper");
const addParticipantBtn = $("#add-participant-btn");

/* ---------- Helpers de estado ---------- */
const isLoggedIn = () => adminSession && adminSession.loggedIn === true;

const setMode = (mode) => {
  if (mode === "spectator") {
    spectatorBtn?.classList?.add("active");
    adminBtn?.classList?.remove("active");
    spectatorSection?.classList?.remove("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    if (adminLoginSection) adminLoginSection.classList.add("hidden");
  } else if (mode === "admin") {
    spectatorBtn?.classList?.remove("active");
    adminBtn?.classList?.add("active");
    spectatorSection?.classList?.remove("hidden");
    if (isLoggedIn()) {
      if (adminPanel) adminPanel.classList.remove("hidden");
      if (adminLoginSection) adminLoginSection.classList.add("hidden");
    } else {
      if (adminPanel) adminPanel.classList.add("hidden");
      if (adminLoginSection) adminLoginSection.classList.remove("hidden");
    }
  }
};

/* ---------- Login / registro ---------- */
const attemptLogin = async () => {
  const email = adminEmailInput?.value.trim().toLowerCase();
  const pass = adminPasswordInput?.value;
  if (!email || !pass) {
    toast("Preencha email e senha.", "#admin-msg");
    return;
  }
  const stored = loadState("inter_admin_user", null);
  if (!stored || stored.email !== email) {
    toast("Organizador não encontrado.", "#admin-msg");
    return;
  }
  const h = await hashText(pass);
  if (h !== stored.passwordHash) {
    toast("Senha incorreta.", "#admin-msg");
    return;
  }
  adminSession = { email, loggedIn: true };
  saveState("inter_admin_session", adminSession);
  toast("Logado.", "#admin-msg");
  renderAll();
};

const registerAdmin = async () => {
  const email = adminEmailInput?.value.trim().toLowerCase();
  const pass = adminPasswordInput?.value;
  if (!email || !pass) {
    toast("Preencha email e senha.", "#admin-msg");
    return;
  }
  if (!email.endsWith("@gmail.com")) {
    toast("Use um Gmail válido (@gmail.com).", "#admin-msg");
    return;
  }
  const pwHash = await hashText(pass);
  saveState("inter_admin_user", { email, passwordHash: pwHash });
  toast("Organizador registrado. Faça login.", "#admin-msg");
};

const logout = () => {
  adminSession = null;
  saveState("inter_admin_session", null);
  toast("Deslogado.", "#admin-msg");
  renderAll();
};

/* ---------- Times e participantes ---------- */
const gatherParticipants = () => {
  const inputs = Array.from(document.querySelectorAll(".participant-input"));
  return inputs.map(i => i.value.trim()).filter(v => v).slice(0, 20);
};

const addTeam = () => {
  if (!isLoggedIn()) {
    toast("Somente organizador pode adicionar.", "#team-msg");
    return;
  }
  const name = teamNameInput?.value.trim();
  const coach = teamCoachInput?.value.trim();
  if (!name) {
    toast("Nome do time obrigatório.", "#team-msg");
    return;
  }
  if (teams.find(t => t.name.toLowerCase() === name.toLowerCase())) {
    toast("Time já existe.", "#team-msg");
    return;
  }
  const participants = gatherParticipants();
  const newTeam = {
    id: crypto.randomUUID(),
    name,
    coach,
    participants,
    wins: 0,
    losses: 0,
    points: 0,
    created: Date.now(),
  };
  teams.push(newTeam);
  saveState("inter_teams", teams);
  if (teamNameInput) teamNameInput.value = "";
  if (teamCoachInput) teamCoachInput.value = "";
  if (participantsWrapper) {
    participantsWrapper.innerHTML = `
      <div class="participant-row">
        <input type="text" class="participant-input" placeholder="Nome do participante" />
        <button class="remove-participant-btn" aria-label="remover">✕</button>
      </div>`;
  }
  toast("Time adicionado.", "#team-msg");
  renderAll();
};

/* ---------- Chave eliminatória ---------- */
const generateBracket = () => {
  if (teams.length < 2) {
    alert("É necessário pelo menos 2 times.");
    return;
  }
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const allMatches = [];
  let current = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i];
    const b = shuffled[i + 1] || null;
    current.push({
      id: crypto.randomUUID(),
      round: 1,
      teamA: a?.id || null,
      teamB: b?.id || null,
      winner: null,
      scoreA: 0,
      scoreB: 0,
      nextMatchId: null,
    });
  }
  allMatches.push(...current);
  let prev = current;
  let round = 2;
  while (prev.length > 1) {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1] || null;
      const match = {
        id: crypto.randomUUID(),
        round,
        teamA: null,
        teamB: null,
        winner: null,
        scoreA: 0,
        scoreB: 0,
        prevMatchA: m1.id,
        prevMatchB: m2?.id || null,
        nextMatchId: null,
      };
      m1.nextMatchId = match.id;
      if (m2) m2.nextMatchId = match.id;
      next.push(match);
    }
    allMatches.push(...next);
    prev = next;
    round += 1;
  }
  bracket = allMatches;
  results = {};
  saveState("inter_bracket", bracket);
  saveState("inter_results", results);
  toast("Chave gerada.", "#admin-msg");
  renderAll();
};

const resetBracket = () => {
  bracket = null;
  results = {};
  saveState("inter_bracket", null);
  saveState("inter_results", {});
  toast("Chave limpa.", "#admin-msg");
  renderAll();
};

/* ---------- Ranking / avanço ---------- */
const computeRanking = () => {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, { ...t, wins:0, losses:0, points:0 }]));
  if (bracket) {
    bracket.forEach(m => {
      const res = results[m.id];
      if (!res) return;
      const { winnerTeamId, scoreA, scoreB } = res;
      if (teamMap[m.teamA]) teamMap[m.teamA].points += (scoreA || 0);
      if (teamMap[m.teamB]) teamMap[m.teamB].points += (scoreB || 0);
      if (winnerTeamId === m.teamA) {
        teamMap[m.teamA].wins += 1;
        if (teamMap[m.teamB]) teamMap[m.teamB].losses += 1;
      } else if (winnerTeamId === m.teamB) {
        teamMap[m.teamB].wins += 1;
        if (teamMap[m.teamA]) teamMap[m.teamA].losses += 1;
      }
    });
  }
  teams = teams.map(t => {
    const updated = teamMap[t.id];
    if (updated) return { ...t, wins: updated.wins, losses: updated.losses, points: updated.points };
    return t;
  });
  saveState("inter_teams", teams);
};

const handleAdvance = (matchId) => {
  const match = bracket?.find(m => m.id === matchId);
  if (!match) return;
  const res = results[matchId];
  if (!res || !res.winnerTeamId) return;
  if (!match.nextMatchId) return;
  const next = bracket.find(m => m.id === match.nextMatchId);
  if (!next) return;
  if (next.prevMatchA === matchId) next.teamA = res.winnerTeamId;
  else if (next.prevMatchB === matchId) next.teamB = res.winnerTeamId;
  saveState("inter_bracket", bracket);
};

/* ---------- Renderização ---------- */
const getTeamNameById = (id) => {
  const t = teams.find(t => t.id === id);
  return t ? t.name : id ? "(pendente)" : "—";
};

const renderTeamList = () => {
  if (!teamListEl) return;
  teamListEl.innerHTML = "";
  if (teams.length === 0) {
    teamListEl.innerHTML = "<li>Nenhum time cadastrado.</li>";
    return;
  }
  teams.forEach(t => {
    const li = document.createElement("li");
    const part = t.participants?.length ? ` | ${t.participants.join(", ")}` : "";
    li.innerHTML = `<strong>${t.name}</strong> (${t.coach || "—"})${part}`;
    teamListEl.appendChild(li);
  });
};

const renderRanking = () => {
  if (!rankingTableBody) return;
  computeRanking();
  const sorted = [...teams].sort((a,b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });
  rankingTableBody.innerHTML = "";
  sorted.forEach((t, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${t.name}</td>
      <td>${t.wins}</td>
      <td>${t.losses}</td>
      <td>${t.points}</td>
    `;
    rankingTableBody.appendChild(tr);
  });
};

const renderBracket = () => {
  if (!bracketContainer) return;
  bracketContainer.innerHTML = "";
  if (!bracket) {
    bracketContainer.textContent = "Chave não gerada ainda. Faça login como organizador e clique em 'Gerar Chave'.";
    return;
  }
  const rounds = {};
  bracket.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });
  const sortedRounds = Object.keys(rounds).sort((a,b)=>a-b);
  const wrapper = document.createElement("div");
  wrapper.classList.add("bracket");

  sortedRounds.forEach(r => {
    const col = document.createElement("div");
    col.classList.add("match-column");
    const title = document.createElement("h4");
    title.textContent = `Ronda ${r}`;
    col.appendChild(title);
    rounds[r].forEach(match => {
      const matchDiv = document.createElement("div");
      matchDiv.classList.add("match");
      const res = results[match.id] || {};
      const winnerId = res.winnerTeamId || match.winner;

      const teamAEl = document.createElement("div");
      teamAEl.classList.add("team");
      if (winnerId === match.teamA) teamAEl.classList.add("winner");
      teamAEl.innerHTML = `<div>${getTeamNameById(match.teamA)}</div><div>${res.scoreA ?? 0}</div>`;

      const teamBEl = document.createElement("div");
      teamBEl.classList.add("team");
      if (winnerId === match.teamB) teamBEl.classList.add("winner");
      teamBEl.innerHTML = `<div>${getTeamNameById(match.teamB)}</div><div>${res.scoreB ?? 0}</div>`;

      matchDiv.appendChild(teamAEl);
      matchDiv.appendChild(teamBEl);

      if (isLoggedIn()) {
        const edit = document.createElement("div");
        edit.style.marginTop = "6px";
        edit.innerHTML = `<div class="small-text">Editar placar:</div>`;
        const inputA = document.createElement("input");
        inputA.type = "number";
        inputA.min = "0";
        inputA.value = res.scoreA ?? 0;
        inputA.classList.add("score-input");
        const inputB = document.createElement("input");
        inputB.type = "number";
        inputB.min = "0";
        inputB.value = res.scoreB ?? 0;
        inputB.classList.add("score-input");
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Atualizar";
        saveBtn.style.fontSize = "0.65rem";

        saveBtn.addEventListener("click", () => {
          const scoreA = parseInt(inputA.value, 10);
          const scoreB = parseInt(inputB.value, 10);
          let winner = null;
          if (!isNaN(scoreA) && !isNaN(scoreB)) {
            if (scoreA > scoreB) winner = match.teamA;
            else if (scoreB > scoreA) winner = match.teamB;
          }
          results[match.id] = {
            scoreA: isNaN(scoreA) ? 0 : scoreA,
            scoreB: isNaN(scoreB) ? 0 : scoreB,
            winnerTeamId: winner,
          };
          saveState("inter_results", results);
          handleAdvance(match.id);
          renderAll();
        });

        edit.appendChild(inputA);
        edit.appendChild(document.createTextNode(" x "));
        edit.appendChild(inputB);
        edit.appendChild(saveBtn);
        matchDiv.appendChild(edit);
      }

      col.appendChild(matchDiv);
    });
    wrapper.appendChild(col);
  });

  bracketContainer.appendChild(wrapper);
};

const renderLiveMatches = () => {
  if (!liveMatchesEl) return;
  liveMatchesEl.innerHTML = "";
  if (!bracket) {
    liveMatchesEl.textContent = "Nenhuma chave criada. Vá à página principal e gere a chave.";
    return;
  }
  const firstRound = bracket.filter(m => m.round === 1);
  if (firstRound.length === 0) {
    liveMatchesEl.textContent = "Sem partidas de primeira fase.";
    return;
  }
  firstRound.forEach(match => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("match");
    const res = results[match.id] || {};
    const teamA = getTeamNameById(match.teamA);
    const teamB = getTeamNameById(match.teamB);
    wrapper.innerHTML = `<div><strong>${teamA}</strong> vs <strong>${teamB}</strong></div>`;
    const sw = document.createElement("div");
    sw.style.display = "flex";
    sw.style.gap = "8px";
    const inputA = document.createElement("input");
    inputA.type = "number";
    inputA.min = "0";
    inputA.value = res.scoreA ?? 0;
    inputA.classList.add("score-input");
    const inputB = document.createElement("input");
    inputB.type = "number";
    inputB.min = "0";
    inputB.value = res.scoreB ?? 0;
    inputB.classList.add("score-input");
    const btn = document.createElement("button");
    btn.textContent = "Atualizar";
    btn.style.fontSize = "0.65rem";
    btn.addEventListener("click", () => {
      const scoreA = parseInt(inputA.value, 10);
      const scoreB = parseInt(inputB.value, 10);
      let winner = null;
      if (!isNaN(scoreA) && !isNaN(scoreB)) {
        if (scoreA > scoreB) winner = match.teamA;
        else if (scoreB > scoreA) winner = match.teamB;
      }
      results[match.id] = {
        scoreA: isNaN(scoreA) ? 0 : scoreA,
        scoreB: isNaN(scoreB) ? 0 : scoreB,
        winnerTeamId: winner,
      };
      saveState("inter_results", results);
      handleAdvance(match.id);
      renderAll();
    });
    sw.appendChild(inputA);
    sw.appendChild(document.createTextNode("x"));
    sw.appendChild(inputB);
    sw.appendChild(btn);
    wrapper.appendChild(sw);
    liveMatchesEl.appendChild(wrapper);
  });
};

/* ---------- Participantes UI ---------- */
const setupParticipantControls = () => {
  if (!participantsWrapper) return;
  participantsWrapper.addEventListener("click", (e) => {
    if (e.target.matches(".remove-participant-btn")) {
      const row = e.target.closest(".participant-row");
      if (row) row.remove();
    }
  });
  if (addParticipantBtn) {
    addParticipantBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const row = document.createElement("div");
      row.classList.add("participant-row");
      row.innerHTML = `
        <input type="text" class="participant-input" placeholder="Nome do participante" />
        <button class="remove-participant-btn" aria-label="remover">✕</button>
      `;
      participantsWrapper.appendChild(row);
    });
  }
};

/* ---------- Sincronização entre abas ---------- */
window.addEventListener("storage", (e) => {
  if (["inter_teams", "inter_bracket", "inter_results", "inter_admin_session"].includes(e.key)) {
    teams = loadState("inter_teams", []);
    bracket = loadState("inter_bracket", null);
    results = loadState("inter_results", {});
    adminSession = loadState("inter_admin_session", null);
    renderAll();
  }
});

/* ---------- Render geral ---------- */
const renderAll = () => {
  setMode(isLoggedIn() ? "admin" : "spectator");
  renderTeamList();
  renderRanking();
  renderBracket();
  renderLiveMatches();

  if (isLoggedIn()) {
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (loginBtn) loginBtn.classList.add("hidden");
    if (registerAdminBtn) registerAdminBtn.classList.add("hidden");
    if (adminLoginSection) {
      const h2 = adminLoginSection.querySelector("h2");
      if (h2) h2.textContent = `Organizador: ${adminSession.email}`;
    }
  } else {
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (registerAdminBtn) registerAdminBtn.classList.remove("hidden");
    if (adminLoginSection) {
      const h2 = adminLoginSection.querySelector("h2");
      if (h2) h2.textContent = "Login do Organizador";
    }
  }
};

/* ---------- Eventos ---------- */
spectatorBtn?.addEventListener("click", () => setMode("spectator"));
adminBtn?.addEventListener("click", () => setMode("admin"));

loginBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  await attemptLogin();
});
registerAdminBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  await registerAdmin();
});
logoutBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  logout();
});

addTeamBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addTeam();
});
generateBracketBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!isLoggedIn()) return;
  generateBracket();
});
resetBracketBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!isLoggedIn()) return;
  resetBracket();
});
syncBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveState("inter_teams", teams);
  saveState("inter_bracket", bracket);
  saveState("inter_results", results);
  saveState("inter_admin_session", adminSession);
  toast("Sincronizado.", "#admin-msg");
});

/* ---------- Inicialização ---------- */
document.addEventListener("DOMContentLoaded", () => {
  setupParticipantControls();
  renderAll();
});
