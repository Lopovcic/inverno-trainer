# Inverno-Trainer

Browser-Übungswerkzeug für **Antonio Vivaldi, „L’inverno“ (Der Winter), RV 297, 3. Satz Allegro – Violino principale**.

- **Tonhöhenerkennung über das Mikrofon** des jeweiligen Geräts (Laptop, Handy, Mac, PC-Headset). YIN-Algorithmus, im Geigenumfang auf ±1–3 Cent genau.
- **Ton für Ton:** Der nächste Ton erscheint erst, wenn der aktuelle sauber getroffen und kurz gehalten wird. Toleranz und Haltezeit sind einstellbar, auf Wunsch wird der Zielton vorgespielt.
- **Passage aufnehmen und bewerten:** Takte markieren (Buchstaben F–N, Takt-Eingabe oder in den Noten ziehen), einzählen lassen, vorspielen. Danach gibt es für jede Note die Abweichung in Cent, falsche und fehlende Töne, eine Rhythmus-Näherung, Tendenzen pro Saite/Finger, Ungenauigkeit nach Lagenwechseln und einen Verlauf deiner Versuche.
- **Referenzaufnahmen:** Eine beliebige Aufnahme laden (MP3/M4A/WAV/…) oder per Mikrofon mitschneiden. Der Trainer erkennt Stimmton (z. B. a′ = 415 Hz) und Transposition und findet jeden Takt automatisch. Danach lässt sich jede Auswahl aus der Referenz abspielen, auch verlangsamt ohne Tonhöhenänderung. YouTube-Links (z. B. Play-Alongs) springen per Takt-Zeiten an die passende Stelle.
- **3D-Geige:** zeigt für den Zielton Saite und Finger (blauer Ring) und, aus der gespielten Tonhöhe berechnet, wo dein Finger gerade wirklich liegt. Dazu die Korrektur in Millimetern („≈ 2,4 mm Richtung Schnecke“).
- **Griffspur** unter den Noten: Saite und Finger jeder Note, Lagenwechsel markiert. Die Fingersätze sind Vorschläge, ein Klick auf eine Zahl ändert sie.
- **Aufgaben (Lehrer ↔ Schüler):** Im Bereich *Aufgaben → Lehrer* (optional mit PIN) stellt die Lehrkraft aus Taktauswahlen einen Übungsplan zusammen: Hinweistext, Zieltempo, Toleranz, Ziel-Punktzahl, Fälligkeit und pro Aufgabe eine Referenz (selbst einspielen, Datei hochladen, vorhandene Aufnahme verknüpfen oder YouTube-Stelle). Eigene Fingersätze und der Kammerton können mitgeschickt werden. Weitergabe ohne Server: als Datei (mit Aufnahmen, auf dem Handy direkt über das Teilen-Menü) oder als Link (ohne Aufnahmen). Schüler sehen ihre Aufgaben, starten sie mit einem Klick mit den Vorgaben der Lehrkraft und schicken ihren Fortschritt zurück, auf Wunsch mit der letzten Aufnahme je Aufgabe. Die Lehrkraft öffnet diesen Bericht im Lehrer-Bereich und kann die Aufnahmen anhören.

## Starten

**Online (Handy, Tablet, jeder Rechner):** <https://lopovcic.github.io/inverno-trainer/> öffnen und oben rechts **Mikrofon starten**. Auf dem Handy lässt sich die Seite über das Browser-Menü („Zum Startbildschirm hinzufügen“) wie eine App ablegen.

**Lokal am PC/Mac:** `index.html` im Chrome, Edge, Firefox oder Safari öffnen (Doppelklick genügt).
Beim ersten Start braucht der Browser Internet, um Notensatz (VexFlow), 3D (three.js) und Schriften zu laden.

Browser erlauben das Mikrofon nur auf `https://`-Seiten oder lokal geöffneten Dateien. Ein lokaler Server im WLAN (`http://192.168…`) reicht fürs Handy deshalb nicht.

**Aktualisieren:** Änderungen committen und `git push` – GitHub Pages veröffentlicht sie nach ein bis zwei Minuten (Versionsnummer `?v=…` in `index.html` erhöhen, damit Browser keine alten Dateien verwenden).

## Tipps

- Kammerton in den Einstellungen anpassen (415/430/440/442/443 Hz oder eigener Wert).
- Gerät 0,5–1 m entfernt auf den Notenständer legen. Mit Metronom oder Referenz während der Aufnahme besser Kopfhörer tragen.
- Tastatur: Leertaste = Start/Stopp · ← → = Ton zurück/vor · R = Zielton · Esc = abbrechen.
- Alle Daten (Einstellungen, Verlauf, Referenzen) bleiben nur im Browser dieses Geräts.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Oberfläche |
| `js/score-data.js` | Notentext (aus Mutopia `winter3.ly` erzeugt) |
| `js/music.js` | Notennamen, Partitur-Modell, Abschnitte, Sonett, Tempi |
| `js/fingering.js` | Fingersatz-Vorschläge (Viterbi über Saite/Finger/Lage) |
| `js/pitch.js` | YIN-Tonhöhenerkennung (live und offline) |
| `js/analysis.js` | Passagen-Auswertung: Ausrichtung, Intonation, Rhythmus, Tendenzen |
| `js/reference.js` | Referenzen: Stimmton-Erkennung, Chroma-DTW-Ausrichtung, IndexedDB, Wiedergabe |
| `js/audio.js` | Mikrofon, Aufnahme, Referenz-Synth, Metronom |
| `js/score-view.js` | Notensatz mit VexFlow, Auswahl, Griffspur, Markierungen |
| `js/chart.js` | Tonhöhenverlauf-Diagramm |
| `js/violin3d.js` | 3D-Geige (three.js) |
| `js/app.js` | Steuerung der Modi |
| `js/tasks.js` | Aufgaben: Lehrer-/Schüler-Ansicht, Übungsplan-Datei/-Link, Fortschrittsbericht |
| `tools/ly2json.mjs` | Konverter LilyPond → Notendaten |

Nach Änderungen an JS/CSS die Versionsnummer `?v=…` in `index.html` erhöhen, damit Browser keine alten Dateien aus dem Cache verwenden.

Notendaten neu erzeugen:

```bash
curl -s https://www.mutopiaproject.org/ftp/VivaldiA/O8/winter/winter-lys/winter3.ly | node tools/ly2json.mjs > js/score-data.js
```

## Quelle und Lizenz des Notentexts

Notentext: [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=351), Mutopia-2010/02/08-351, nach dem Faksimile der Erstausgabe (Le Cène, Amsterdam 1725). Lizenz [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Die abgeleitete Datei `js/score-data.js` steht unter derselben Lizenz.
