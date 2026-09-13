const MOOD_LABELS = {
    1: "nicht gut/sehr gestresst",
    2: "eher wenig motiviert/müde",
    3: "keine Ahnung/meh/neutral",
    4: "gut/passt schon",
    5: "sehr gut/motiviert"
};

const VOTE_COOLDOWN_MS = 10000; // 10 Sekunden zwischen Änderungen
const TEACHER_CODE = "POET"; // muss mit password.html und TEACHER_CODE in app.py übereinstimmen

let cooldownInterval = null;
let currentMyVote = null; // aus dem Server-Status gecacht, damit wir nicht bei jedem Klick neu fetchen müssen

// ---------- Cooldown (nur clientseitig - verhindert Klick-Spam, keine echte Sicherheitsgrenze) ----------

function getRemainingCooldown() {
    const last = Number(localStorage.getItem('lastVoteChangeTime')) || 0;
    return Math.max(0, VOTE_COOLDOWN_MS - (Date.now() - last));
}

function setLastVoteChangeTime() {
    localStorage.setItem('lastVoteChangeTime', Date.now());
}

// ---------- Abstimmung: läuft jetzt über das Flask-Backend statt localStorage ----------

function showVoteConfirmation(mood) {
    currentMyVote = mood;
    const message = document.getElementById("voteMessage");
    const withdraw = document.getElementById("withdrawButton");
    if (message) {
        message.style.display = "block";
        message.textContent = "Deine Stimme: " + MOOD_LABELS[mood] + " – du kannst jederzeit eine andere Option anklicken oder sie zurückziehen.";
    }
    if (withdraw) withdraw.style.display = "inline-block";
}

function hideVoteConfirmation() {
    currentMyVote = null;
    const message = document.getElementById("voteMessage");
    const withdraw = document.getElementById("withdrawButton");
    if (message) message.style.display = "none";
    if (withdraw) withdraw.style.display = "none";
}

function showCooldownMessage(remainingMs) {
    const message = document.getElementById("voteMessage");
    const buttons = document.querySelectorAll("#voteButtons button");
    const withdraw = document.getElementById("withdrawButton");

    buttons.forEach(btn => btn.disabled = true);
    if (withdraw) withdraw.disabled = true;

    if (cooldownInterval) clearInterval(cooldownInterval);

    const update = () => {
        const remaining = getRemainingCooldown();
        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            buttons.forEach(btn => btn.disabled = false);
            if (withdraw) withdraw.disabled = false;

            if (currentMyVote !== null) {
                showVoteConfirmation(currentMyVote);
            } else if (message) {
                message.style.display = "none";
            }
            return;
        }
        if (message) {
            message.style.display = "block";
            message.textContent = "Bitte warte noch " + Math.ceil(remaining / 1000) + " Sekunde(n), bevor du deine Stimme änderst.";
        }
    };

    update();
    cooldownInterval = setInterval(update, 1000);
}

async function checkVoteStatus() {
    try {
        const res = await fetch("/api/status");
        const data = await res.json();
        if (data.myVote !== null) {
            showVoteConfirmation(data.myVote);
        }
    } catch (err) {
        console.error("Status konnte nicht geladen werden:", err);
    }

    const remaining = getRemainingCooldown();
    if (remaining > 0) {
        showCooldownMessage(remaining);
    }
}

async function addMood(mood) {
    if (currentMyVote === mood) return; // schon genau diese Stimme abgegeben

    const remaining = getRemainingCooldown();
    if (remaining > 0) {
        showCooldownMessage(remaining);
        return;
    }

    try {
        const res = await fetch("/api/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mood })
        });
        if (!res.ok) throw new Error("Server hat die Stimme abgelehnt");

        setLastVoteChangeTime();
        showVoteConfirmation(mood);
    } catch (err) {
        console.error("Abstimmen fehlgeschlagen:", err);
        alert("Deine Stimme konnte nicht gespeichert werden. Bist du mit dem Server verbunden?");
    }
}

async function withdrawVote() {
    if (currentMyVote === null) return;

    const remaining = getRemainingCooldown();
    if (remaining > 0) {
        showCooldownMessage(remaining);
        return;
    }

    try {
        const res = await fetch("/api/vote", { method: "DELETE" });
        if (!res.ok) throw new Error("Server hat das Zurückziehen abgelehnt");

        setLastVoteChangeTime();
        hideVoteConfirmation();
    } catch (err) {
        console.error("Zurückziehen fehlgeschlagen:", err);
        alert("Deine Stimme konnte nicht zurückgezogen werden. Bist du mit dem Server verbunden?");
    }
}

// ---------- Lehrerbereich: Durchschnitt & Reset ----------

async function showAverageMood() {
    const ergebnisEl = document.getElementById("ergebnis");
    if (!ergebnisEl) return;

    try {
        const res = await fetch("/api/average");
        const data = await res.json();
        ergebnisEl.style.display = "block";

        if (data.counter === 0) {
            ergebnisEl.textContent = "Nobody voted yet";
        } else {
            ergebnisEl.textContent = data.counter + " Stimme(n) abgegeben – Durchschnitt: " + data.average + "/5";
        }
    } catch (err) {
        console.error("Durchschnitt konnte nicht geladen werden:", err);
    }
}

async function resetAll() {
    try {
        const res = await fetch("/api/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: TEACHER_CODE })
        });
        if (!res.ok) throw new Error("Reset abgelehnt");
    } catch (err) {
        console.error("Reset fehlgeschlagen:", err);
        alert("Zurücksetzen ist fehlgeschlagen.");
    }
}

// ---------- Texteinträge ----------

async function enterTA() {
    const textarea = document.getElementById("eingabe");
    const value = textarea.value.trim();
    if (value === "") return;

    try {
        const res = await fetch("/api/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: value })
        });
        if (!res.ok) throw new Error("Eintrag wurde abgelehnt");

        textarea.value = "";
        textarea.placeholder = "Neuer Eintrag...";
        renderTextList();
    } catch (err) {
        console.error("Text konnte nicht gespeichert werden:", err);
        alert("Dein Eintrag konnte nicht gespeichert werden.");
    }
}

async function renderTextList() {
    const liste = document.getElementById("liste");
    if (!liste) return;

    try {
        const res = await fetch("/api/text");
        const data = await res.json();
        liste.innerHTML = "";

        if (data.entries.length === 0) {
            const li = document.createElement("li");
            li.textContent = "Noch keine Einträge.";
            liste.appendChild(li);
            return;
        }

        data.entries.forEach(entry => {
            const li = document.createElement("li");
            li.textContent = entry;
            liste.appendChild(li);
        });
    } catch (err) {
        console.error("Einträge konnten nicht geladen werden:", err);
    }
}

async function resetTextEntries() {
    try {
        const res = await fetch("/api/text", { method: "DELETE" });
        if (!res.ok) throw new Error("Löschen abgelehnt");
        renderTextList();
    } catch (err) {
        console.error("Einträge konnten nicht gelöscht werden:", err);
        alert("Einträge konnten nicht gelöscht werden.");
    }
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