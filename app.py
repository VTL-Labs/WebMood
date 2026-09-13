from flask import Flask, request, jsonify, send_from_directory, redirect
import sqlite3
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "stimmung.db")
TEACHER_CODE = "POET"  # TODO: später durch etwas Sichereres ersetzen

# WICHTIG: static_folder muss der Ordner sein, der CSS/, JS/ und deine
# HTML-Dateien enthält (also dort, wo relative Pfade wie "../CSS/..."
# tatsächlich hinzeigen). Ggf. anpassen, siehe Hinweis unten im Chat.
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL,
            device_ip TEXT NOT NULL,
            mood INTEGER NOT NULL,
            UNIQUE(round_id, device_ip)
        );
        CREATE TABLE IF NOT EXISTS text_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT
        );
    """)
    if conn.execute("SELECT COUNT(*) AS c FROM rounds").fetchone()["c"] == 0:
        conn.execute("INSERT INTO rounds (created_at) VALUES (?)", (datetime.now().isoformat(),))
    conn.commit()
    conn.close()


def get_current_round_id(conn):
    return conn.execute("SELECT id FROM rounds ORDER BY id DESC LIMIT 1").fetchone()["id"]


def get_device_id():
    # Auf dem isolierten Pi-WLAN bekommt jedes Gerät eine eigene lokale IP,
    # das reicht als einfache Geräte-Erkennung für dieses Schulprojekt.
    return request.remote_addr


# ---------- Frontend ausliefern ----------

@app.route("/")
def serve_home():
    # HOME.html liegt in HTML/, nicht direkt im Root - Redirect dorthin,
    # damit die relativen Pfade (../CSS/..., ../JS/...) in HOME.html stimmen.
    return redirect("/HTML/HOME.html")


# Alle anderen Dateien (CSS, JS, restliche HTML-Seiten in Unterordnern)
# liefert Flask automatisch über static_folder aus.


# ---------- API: Abstimmung ----------

@app.route("/api/status")
def status():
    conn = get_db()
    round_id = get_current_round_id(conn)
    row = conn.execute(
        "SELECT mood FROM votes WHERE round_id=? AND device_ip=?",
        (round_id, get_device_id())
    ).fetchone()
    conn.close()
    return jsonify({"roundId": round_id, "myVote": row["mood"] if row else None})


@app.route("/api/vote", methods=["POST"])
def vote():
    data = request.get_json(force=True)
    mood = int(data.get("mood", 0))
    if mood < 1 or mood > 5:
        return jsonify({"error": "ungültiger Wert"}), 400

    conn = get_db()
    round_id = get_current_round_id(conn)
    conn.execute("""
        INSERT INTO votes (round_id, device_ip, mood) VALUES (?, ?, ?)
        ON CONFLICT(round_id, device_ip) DO UPDATE SET mood=excluded.mood
    """, (round_id, get_device_id(), mood))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/vote", methods=["DELETE"])
def withdraw_vote():
    conn = get_db()
    round_id = get_current_round_id(conn)
    conn.execute("DELETE FROM votes WHERE round_id=? AND device_ip=?", (round_id, get_device_id()))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/average")
def average():
    conn = get_db()
    round_id = get_current_round_id(conn)
    row = conn.execute(
        "SELECT COUNT(*) AS counter, COALESCE(SUM(mood), 0) AS total FROM votes WHERE round_id=?",
        (round_id,)
    ).fetchone()
    conn.close()
    counter = row["counter"]
    avg = round(row["total"] / counter, 2) if counter > 0 else None
    return jsonify({"counter": counter, "average": avg})


# ---------- API: Texteinträge ----------

@app.route("/api/text", methods=["GET"])
def get_text_entries():
    conn = get_db()
    round_id = get_current_round_id(conn)
    rows = conn.execute(
        "SELECT content FROM text_entries WHERE round_id=? ORDER BY id", (round_id,)
    ).fetchall()
    conn.close()
    return jsonify({"entries": [r["content"] for r in rows]})


@app.route("/api/text", methods=["POST"])
def add_text_entry():
    data = request.get_json(force=True)
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "leerer Eintrag"}), 400

    conn = get_db()
    round_id = get_current_round_id(conn)
    conn.execute(
        "INSERT INTO text_entries (round_id, content, created_at) VALUES (?, ?, ?)",
        (round_id, content, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/text", methods=["DELETE"])
def clear_text_entries():
    conn = get_db()
    round_id = get_current_round_id(conn)
    conn.execute("DELETE FROM text_entries WHERE round_id=?", (round_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------- API: Lehrerbereich ----------

@app.route("/api/reset", methods=["POST"])              
def reset_round():
    data = request.get_json(force=True)
    if data.get("code") != TEACHER_CODE:
        return jsonify({"error": "falscher Code"}), 403

    conn = get_db()
    conn.execute("INSERT INTO rounds (created_at) VALUES (?)", (datetime.now().isoformat(),))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)