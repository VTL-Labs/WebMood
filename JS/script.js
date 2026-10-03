const SUPABASE_URL = "https://ujrfewbdgnnfygiwnmpl.supabase.co";
const SUPABASE_KEY = "sb_publishable_g4cUaTcbdDcseHz92hIK8A_9zpbBeZO";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MOOD_LABELS = {
    1: "nicht gut/sehr gestresst",
    2: "eher wenig motiviert/müde",
    3: "keine Ahnung/meh/neutral",
    4: "gut/passt schon",
    5: "sehr gut/motiviert"
};

const VOTE_COOLDOWN_MS = 10000; // 10 Sekunden gegen versehentliche Doppelklicks

let cooldownInterval = null;
let currentRoundId = null;

// ---------- Aktuelle Runde ermitteln (einmal pro Seitenaufruf gecacht) ----------

async function getCurrentRoundId() {
    if (currentRoundId !== null) return currentRoundId;

    const { data, error } = await sb
        .from("rounds")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error("Runde konnte nicht geladen werden:", error);
        return null;
    }

    currentRoundId = data.id;
    return currentRoundId;
}

// ---------- Cooldown (nur clientseitig, verhindert Doppelklicks) ----------

function getRemainingCooldown() {
    const last = Number(localStorage.getItem('lastVoteChangeTime')) || 0;
    return Math.max(0, VOTE_COOLDOWN_MS - (Date.now() - last));
}

function setLastVoteChangeTime() {
    localStorage.setItem('lastVoteChangeTime', Date.now());
}

function showCooldownMessage(remainingMs) {
    const message = document.getElementById("voteMessage");
    const buttons = document.querySelectorAll("#voteButtons button");

    buttons.forEach(btn => btn.disabled = true);
    if (cooldownInterval) clearInterval(cooldownInterval);

    const update = () => {
        const remaining = getRemainingCooldown();
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            buttons.forEach(btn => btn.disabled = false);
            if (message) message.style.display = "none";
            return;
        }
        if (message) {
            message.style.display = "block";
            message.textContent = "Bitte warte noch " + Math.ceil(remaining / 1000) + " Sekunde(n).";
        }
    };

    update();
    cooldownInterval = setInterval(update, 1000);
}

// ---------- Abstimmung: ein Klick, lokale Bestätigung, keine echte Sperre ----------

function hasVotedThisSession() {
    return localStorage.getItem('hasVoted') === 'true';
}

function markVotedThisSession() {
    localStorage.setItem('hasVoted', 'true');
}

function showVoteConfirmation(mood) {
    const buttons = document.getElementById("voteButtons");
    const message = document.getElementById("voteMessage");
    if (buttons) buttons.style.display = "none";
    if (message) {
        message.style.display = "block";
        message.textContent = "Danke! Deine Stimme (" + MOOD_LABELS[mood] + ") wurde gespeichert.";
    }
}

async function checkVoteStatus() {
    if (hasVotedThisSession()) {
        const buttons = document.getElementById("voteButtons");
        const message = document.getElementById("voteMessage");
        if (buttons) buttons.style.display = "none";
        if (message) {
            message.style.display = "block";
            message.textContent = "Du hast in dieser Runde schon abgestimmt. Danke!";
        }
    }
}

async function addMood(mood) {
    if (hasVotedThisSession()) return;

    const remaining = getRemainingCooldown();
    if (remaining > 0) {
        showCooldownMessage(remaining);
        return;
    }

    const roundId = await getCurrentRoundId();
    if (roundId === null) {
        alert("Verbindung zur Datenbank fehlgeschlagen. Hast du Internet?");
        return;
    }

    const { error } = await sb.from("votes").insert({ round_id: roundId, mood: mood });
    if (error) {
        console.error("Abstimmen fehlgeschlagen:", error);
        alert("Deine Stimme konnte nicht gespeichert werden.");
        return;
    }

    setLastVoteChangeTime();
    markVotedThisSession();
    showVoteConfirmation(mood);
}

// ---------- Lehrerbereich: Durchschnitt ----------

async function showAverageMood() {
    const ergebnisEl = document.getElementById("ergebnis");
    if (!ergebnisEl) return;

    const roundId = await getCurrentRoundId();
    const { data, error } = await sb
        .from("votes")
        .select("mood")
        .eq("round_id", roundId);

    if (error) {
        console.error("Durchschnitt konnte nicht geladen werden:", error);
        return;
    }

    ergebnisEl.style.display = "block";
    const counter = data.length;

    if (counter === 0) {
        ergebnisEl.textContent = "Nobody voted yet";
    } else {
        const total = data.reduce((sum, row) => sum + row.mood, 0);
        ergebnisEl.textContent = counter + " Stimme(n) abgegeben – Durchschnitt: " + (total / counter).toFixed(2) + "/5";
    }
}

// Reset braucht Lehrer-Login (Supabase Auth) - kommt als nächster Schritt.
async function resetAll() {
    const { error } = await sb.from("rounds").insert({});
    if (error) {
        console.error("Reset fehlgeschlagen:", error);
        alert("Zurücksetzen fehlgeschlagen - bist du eingeloggt?");
        return;
    }
    currentRoundId = null;
    await getCurrentRoundId();
    localStorage.removeItem('hasVoted');
}

// ---------- Texteinträge ----------

async function enterTA() {
    const textarea = document.getElementById("eingabe");
    const value = textarea.value.trim();
    if (value === "") return;

    const roundId = await getCurrentRoundId();
    const { error } = await sb.from("text_entries").insert({ round_id: roundId, content: value });

    if (error) {
        console.error("Text konnte nicht gespeichert werden:", error);
        alert("Dein Eintrag konnte nicht gespeichert werden.");
        return;
    }

    textarea.value = "";
    textarea.placeholder = "Neuer Eintrag...";
    renderTextList();
}

async function renderTextList() {
    const liste = document.getElementById("liste");
    if (!liste) return;

    const roundId = await getCurrentRoundId();
    const { data, error } = await sb
        .from("text_entries")
        .select("content")
        .eq("round_id", roundId)
        .order("id", { ascending: true });

    if (error) {
        console.error("Einträge konnten nicht geladen werden:", error);
        return;
    }

    liste.innerHTML = "";

    if (!data || data.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Noch keine Einträge.";
        liste.appendChild(li);
        return;
    }

    data.forEach(row => {
        const li = document.createElement("li");
        li.textContent = row.content;
        liste.appendChild(li);
    });
}

// Löschen braucht Lehrer-Login (Supabase Auth) - kommt als nächster Schritt.
async function resetTextEntries() {
    const roundId = await getCurrentRoundId();
    const { error } = await sb.from("text_entries").delete().eq("round_id", roundId);

    if (error) {
        console.error("Einträge konnten nicht gelöscht werden:", error);
        alert("Löschen fehlgeschlagen - bist du eingeloggt?");
        return;
    }

    renderTextList();
}

// ---------- Seiten-Setup ----------

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("liste")) {
        renderTextList();
    }
    if (document.getElementById("voteButtons")) {
        checkVoteStatus();
    }
});