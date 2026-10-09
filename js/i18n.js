/* Inverno-Trainer · i18n.js
 * UI languages: Deutsch (source language, used as the key), Srpski (latinica) and
 * Српски (ћирилица). Serbian is written once in Latin script; Cyrillic is derived by
 * transliteration. Text inside «…» stays Latin (units, brand names, note letters).
 * Note names keep the central-European system (c d e f g a h, b = H-flat), which is
 * also the standard in Serbian music teaching.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  // ------------------------------------------------------------------ dictionary (de → sr-Latn)
  const SR = {
    // --- header, tabs, general
    'Übungsmodus': 'Način vežbanja',
    'Ton für Ton': 'Ton po ton',
    'Passage': 'Pasaž',
    'Referenzen': 'Reference',
    'Aufgaben': 'Zadaci',
    'Mikrofon starten': 'Uključi mikrofon',
    'Mikrofon an': 'Mikrofon uključen',
    'Mikrofon an – zum Ausschalten klicken': 'Mikrofon je uključen – klikni da ga isključiš',
    'Anleitung': 'Uputstvo',
    'Einstellungen': 'Podešavanja',
    'Sprache': 'Jezik',
    'Noten': 'Note',
    'Abschnitte (Buchstaben)': 'Odseci (slova)',
    'Takt': 'Takt',
    'bis Takt': 'do takta',
    'von Takt': 'od takta',
    'Ganzer Satz': 'Ceo stav',
    'Griffspur': 'Prstomet',
    'Tonhöhenverlauf': 'Tok visine tona',
    '▶ Aufnahme anhören': '▶ Preslušaj snimak',
    '■ Stopp': '■ Stop',
    'Analyse ausblenden': 'Sakrij analizu',
    'Tonhöhenverlauf: Sollnoten als Balken, gespielte Tonhöhe als Linie': 'Tok visine tona: zadate note kao trake, odsvirana visina kao linija',
    'Balken = Sollton (±50 Cent), Linie = deine gespielte Tonhöhe, Punkte = gemessene Intonation je Note. Klicke eine Note für Details.':
      'Traka = zadati ton (±50 centi), linija = tvoja odsvirana visina tona, tačke = izmerena intonacija po noti. Klikni na notu za detalje.',
    'Noten werden gesetzt …': 'Note se pripremaju …',
    'Notentext: <a href="https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=351" target="_blank" rel="noopener">Mutopia Project</a> (Mutopia-2010/02/08-351, nach der Erstausgabe Amsterdam 1725), Lizenz <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. Fingersätze sind Vorschläge des Trainers und lassen sich pro Note ändern.':
      'Notni tekst: <a href="https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=351" target="_blank" rel="noopener">«Mutopia Project»</a> («Mutopia-2010/02/08-351»), prema prvom izdanju, Amsterdam 1725), licenca <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">«CC BY-SA 3.0»</a>. Prstomet je predlog trenera i može se menjati za svaku notu.',
    'Instrument und Stimmgerät': 'Instrument i štimer',
    '3D-Ansicht': '«3D» prikaz',
    '3D-Ansicht vergrößern': 'Uvećaj «3D» prikaz',
    '3D-Ansicht verkleinern': 'Smanji «3D» prikaz',
    'Spieler': 'Svirač',
    'Griffbrett': 'Hvataljka',
    'Ganz': 'Cela',
    'Ziel': 'Cilj',
    'gespielt': 'odsvirano',
    'Zielton': 'Ciljni ton',
    'Gespielt': 'Odsvirano',
    'Wähle Takte in den Noten und starte das Mikrofon.': 'Izaberi taktove u notama i uključi mikrofon.',

    // --- Ton für Ton
    'Der nächste Ton kommt erst, wenn du den aktuellen sauber triffst und kurz hältst.': 'Sledeći ton dolazi tek kada tačno pogodiš trenutni i kratko ga zadržiš.',
    'Vorheriger Ton': 'Prethodni ton',
    'Ton überspringen': 'Preskoči ton',
    'Üben starten': 'Počni vežbanje',
    'Pause': 'Pauza',
    'Weiter üben': 'Nastavi vežbanje',
    'Nochmal': 'Ponovo',
    'Zielton anhören (R)': 'Preslušaj ciljni ton («R»)',
    '♪ Ton': '♪ Ton',
    'Toleranz': 'Tolerancija',
    'Haltezeit': 'Vreme zadržavanja',
    'Zielton vor jedem Ton vorspielen': 'Pusti ciljni ton pre svakog tona',
    'Wiederholte Töne zusammenfassen': 'Spoji ponovljene tonove',
    'Auswahl in Schleife üben': 'Vežbaj izbor u petlji',
    'getroffen': 'pogođeno',
    'Ø bis Treffer': 'Ø do pogotka',
    'übersprungen': 'preskočeno',
    'Am längsten gesucht': 'Najduže traženo',
    'Noch keine Problemstellen.': 'Još nema problematičnih mesta.',
    'Takt {m}': 'Takt {m}',
    'Spiel den markierten Ton.': 'Odsviraj označeni ton.',
    '<strong>Geschafft!</strong> Alle {n} Töne der Auswahl getroffen.': '<strong>Uspelo!</strong> Svi tonovi izbora ({n}) su pogođeni.',
    'Durchgang geschafft: {n} Töne, Ø {s} s bis zum Treffer. Nächste Runde!': 'Krug završen: tonova {n}, Ø {s} «s» do pogotka. Sledeći krug!',
    'Auswahl komplett. Wähle die nächsten Takte oder klicke „Nochmal“.': 'Izbor je završen. Izaberi sledeće taktove ili klikni „Ponovo“.',
    'Gleicher Ton nochmal – neu anstreichen.': 'Isti ton još jednom – ponovo povuci gudalo.',
    'Finger ≈ <strong>{mm} mm</strong> Richtung <strong>Schnecke</strong> (du bist zu hoch)': 'Prst ≈ <strong>{mm} «mm»</strong> prema <strong>pužu</strong> (previsoko si)',
    'Finger ≈ <strong>{mm} mm</strong> Richtung <strong>Steg</strong> (du bist zu tief)': 'Prst ≈ <strong>{mm} «mm»</strong> prema <strong>kobilici</strong> (prenisko si)',
    'Leere {s}-Saite ist zu hoch gestimmt – Wirbel/Feinstimmer prüfen.': 'Prazna {s} žica je previsoko naštimovana – proveri čiviju ili fini štimer.',
    'Leere {s}-Saite ist zu tief gestimmt – Wirbel/Feinstimmer prüfen.': 'Prazna {s} žica je prenisko naštimovana – proveri čiviju ili fini štimer.',
    'Zu hoch': 'Previsoko',
    'Zu tief': 'Prenisko',
    'Das ist <strong>{played}</strong> – gesucht ist <strong>{target}</strong> ({s}-Saite, {finger}).': 'To je <strong>{played}</strong> – traži se <strong>{target}</strong> ({s} žica, {finger}).',
    '<strong>Sauber!</strong> Halten …': '<strong>Čisto!</strong> Zadrži …',
    'zu hoch · Ziel {t}': 'previsoko · cilj {t}',
    'zu tief · Ziel {t}': 'prenisko · cilj {t}',
    '{s}-Saite': '{s} žica',
    '{f}. Finger': '{f}. prst',
    'leer': 'prazna',
    '{p}. Lage': '{p}. pozicija',
    'leere Saite': 'prazna žica',
    'Zielton {name}, {s}-Saite, {finger}, Takt {m}.': 'Ciljni ton {name}, {s} žica, {finger}, takt {m}.',
    'T. {m}': 't. {m}',

    // --- Passage
    'Passage aufnehmen & bewerten': 'Snimi i oceni pasaž',
    'Auswahl: T. {m1}–{m2} · {n} Noten · ca. {s} s bei ♩. = {bpm}': 'Izbor: t. {m1}–{m2} · nota: {n} · oko {s} «s» pri ♩. = {bpm}',
    'Tempo': 'Tempo',
    'Einzählen (1 Takt)': 'Odbrojavanje (1 takt)',
    'Metronom während der Aufnahme (Kopfhörer!)': 'Metronom tokom snimanja (slušalice!)',
    'Mitlauf-Cursor im Tempo': 'Kursor prati tempo',
    'Aufnehmen': 'Snimi',
    'Stopp': 'Stop',
    'Passage mit dem Synthesizer vorspielen': 'Pusti pasaž sintisajzerom',
    '♪ Vorspielen': '♪ Pusti',
    '▶ Referenz': '▶ Referenca',
    'Aufnahme-Datei analysieren …': 'Analiziraj fajl snimka …',
    'Demo ohne Geige': 'Demo bez violine',
    'Verlauf dieser Auswahl': 'Istorija ovog izbora',
    'Versuche: {n} · zuletzt {last} · bester {best}': 'Pokušaji: {n} · poslednji {last} · najbolji {best}',
    ' · Tempo zuletzt ♩. ≈ {t}': ' · poslednji tempo ♩. ≈ {t}',
    'Einzählen …': 'Odbrojavanje …',
    '<strong>Aufnahme läuft</strong> – spiel die Passage.': '<strong>Snimanje je u toku</strong> – odsviraj pasaž.',
    'Aufnahme läuft.': 'Snimanje je u toku.',
    'Die Aufnahme war zu kurz.': 'Snimak je bio prekratak.',
    'Analysiere …': 'Analiziram …',
    'Analyse fehlgeschlagen.': 'Analiza nije uspela.',
    'Speichern fehlgeschlagen.': 'Čuvanje nije uspelo.',
    'Keine Noten im gewählten Bereich.': 'Nema nota u izabranom opsegu.',
    'Kein Spiel erkannt. Prüfe Mikrofon und Eingangspegel und spiele etwas lauter.': 'Sviranje nije prepoznato. Proveri mikrofon i nivo ulaza i sviraj malo glasnije.',
    'Ausgezeichnet': 'Odlično',
    'Sehr gut': 'Vrlo dobro',
    'Gut': 'Dobro',
    'Ordentlich – da geht noch was': 'Solidno – ima prostora za napredak',
    'Weiter üben ': 'Vežbaj dalje',
    'Gesamtwertung {n} von 100': 'Ukupna ocena {n} od 100',
    '{count} Noten · {good} sauber · {wrong} falsch · {missed} nicht erkannt': 'nota: {count} · čisto: {good} · pogrešno: {wrong} · nije prepoznato: {missed}',
    'Intonation': 'Intonacija',
    'Treffer ±{tol} ct': 'Pogoci ±{tol} «ct»',
    'Rhythmus': 'Ritam',
    'Keine klare Tendenz nach oben oder unten.': 'Nema jasne tendencije naviše ili naniže.',
    'Im Schnitt <strong>{c}</strong> – du intonierst eher zu hoch.': 'U proseku <strong>{c}</strong> – intoniraš uglavnom previsoko.',
    'Im Schnitt <strong>{c}</strong> – du intonierst eher zu tief.': 'U proseku <strong>{c}</strong> – intoniraš uglavnom prenisko.',
    'Mittlere Abweichung: {c} ct.': 'Prosečno odstupanje: {c} «ct».',
    'Tendenzen pro Finger': 'Tendencije po prstima',
    '{f}. Finger auf der {s}-Saite': '{f}. prst na {s} žici',
    '({n} Noten)': '(nota: {n})',
    'Nach Lagenwechseln liegst du im Schnitt {a} ct daneben (sonst {b} ct) – Lagenwechsel gezielt langsam üben.': 'Posle promene pozicije u proseku odstupaš {a} «ct» (inače {b} «ct») – vežbaj promene pozicije polako i ciljano.',
    'Genauer anschauen': 'Pogledaj pažljivije',
    'nicht erkannt': 'nije prepoznato',
    'falsch ({n})': 'pogrešno ({n})',
    'Ref. {c}': 'Ref. {c}',
    'Schwierigste Stelle Ton für Ton': 'Najteže mesto ton po ton',
    'Als Referenz speichern': 'Sačuvaj kao referencu',
    'Klicke eine Note in den Noten oder im Verlauf, um zu sehen, wo dein Finger lag.': 'Klikni na notu u notama ili u grafikonu da vidiš gde ti je bio prst.',
    'Note T. {m}': 'Nota t. {m}',
    'Referenz: {c}': 'Referenca: {c}',
    'gemessen (Median)': 'izmereno (medijana)',
    'Leere Saite: {c} – Stimmung prüfen.': 'Prazna žica: {c} – proveri štimovanje.',
    '<strong>Sauber.</strong> Dein Finger lag praktisch richtig ({mm} mm).': '<strong>Čisto.</strong> Prst ti je bio praktično na mestu ({mm} «mm»).',
    'Dein Finger lag ≈ <strong>{mm} mm</strong> zu weit Richtung Steg (zu hoch). Gespielt auf der {s}-Saite angenommen.': 'Prst ti je bio ≈ <strong>{mm} «mm»</strong> previše prema kobilici (previsoko). Pretpostavljeno je sviranje na {s} žici.',
    'Dein Finger lag ≈ <strong>{mm} mm</strong> zu weit Richtung Schnecke (zu tief). Gespielt auf der {s}-Saite angenommen.': 'Prst ti je bio ≈ <strong>{mm} «mm»</strong> previše prema pužu (prenisko). Pretpostavljeno je sviranje na {s} žici.',
    'falscher Ton': 'pogrešan ton',
    'Gespielt wurde <strong>{p}</strong> statt <strong>{t}</strong>.': 'Odsvirano je <strong>{p}</strong> umesto <strong>{t}</strong>.',
    'Diese Note war in der Aufnahme nicht zu hören (zu kurz, zu leise oder ausgelassen).': 'Ova nota se ne čuje na snimku (prekratka, pretiha ili izostavljena).',
    'Tonhöhenverlauf · T. {m1}–{m2} ({src})': 'Tok visine tona · t. {m1}–{m2} ({src})',
    'Aufnahme': 'snimak',
    'Demo': 'demo',
    'Datei konnte nicht gelesen werden (Format nicht unterstützt?).': 'Fajl nije moguće pročitati (format nije podržan?).',
    'Als Referenz gespeichert.': 'Sačuvano kao referenca.',
    'Eigene Aufnahme T. {m1}–{m2}': 'Sopstveni snimak t. {m1}–{m2}',
    'Auswertung: {o} von 100 Punkten, {v}. Intonation {i}, Treffer {h} Prozent.': 'Ocena: {o} od 100 poena, {v}. Intonacija {i}, pogoci {h} procenata.',
    'falscher Ton: {n}': 'pogrešan ton: {n}',

    // --- References
    'Referenzaufnahmen': 'Referentni snimci',
    'Lade eine Aufnahme (z. B. deine Lieblingsinterpretation oder einen Play-Along) – der Trainer findet jeden Takt darin automatisch. Danach spielst du jede ausgewählte Passage als Referenz ab, auch verlangsamt ohne Tonhöhenänderung.':
      'Učitaj snimak (npr. tvoju omiljenu interpretaciju ili «play-along») – trener sam pronalazi svaki takt u njemu. Zatim svaki izabrani pasaž možeš pustiti kao referencu, i usporeno bez promene visine tona.',
    'Audio- oder Videodatei hierher ziehen': 'Prevuci audio ili video fajl ovde',
    'Datei wählen …': 'Izaberi fajl …',
    '● Über Mikrofon mitschneiden': '● Snimi preko mikrofona',
    '■ Mitschnitt beenden ({t})': '■ Završi snimanje ({t})',
    'YouTube-Link als Referenz hinzufügen': 'Dodaj «YouTube» link kao referencu',
    'Link': 'Link',
    'Name': 'Naziv',
    'Link hinzufügen': 'Dodaj link',
    'YouTube lässt sich nicht direkt analysieren. Trage ein, bei welcher Video-Zeit Takt 1 beginnt – dann öffnet der Trainer das Video an jeder gewählten Stelle. Für Klang-Analyse und Abspielen im Trainer: Video abspielen und über Mikrofon mitschneiden.':
      '«YouTube» se ne može direktno analizirati. Unesi u kom trenutku videa počinje takt 1 – tada trener otvara video na svakom izabranom mestu. Za analizu zvuka i reprodukciju u treneru: pusti video i snimi ga preko mikrofona.',
    'Abspieltempo': 'Brzina reprodukcije',
    'Auswahl in Schleife': 'Izbor u petlji',
    'aktiv': 'aktivno',
    'alle Takte gefunden': 'svi taktovi pronađeni',
    '{n} Noten mit Intonation': 'nota sa intonacijom: {n}',
    'YouTube-Link': '«YouTube» link',
    'T. {m} bei {t}': 't. {m} u {t}',
    'Startzeit fehlt': 'nedostaje vreme početka',
    'Auswahl nicht enthalten': 'Izbor nije sadržan',
    'YouTube ab T. {m} ↗': '«YouTube» od t. {m} ↗',
    'Takt-Zeiten': 'Vremena taktova',
    'Löschen': 'Obriši',
    'Wirklich löschen?': 'Zaista obrisati?',
    'Noch keine Referenz. Lade eine Aufnahme oder füge einen Link hinzu.': 'Još nema reference. Učitaj snimak ili dodaj link.',
    'Die Takte wurden automatisch gefunden. Liegt eine Stelle daneben, trage die richtige Zeit ein (in der Aufnahme).': 'Taktovi su pronađeni automatski. Ako neko mesto odstupa, unesi tačno vreme (u snimku).',
    'Trage ein, bei welcher Video-Zeit ein Takt beginnt. Ein Eintrag genügt, zwei oder mehr machen es genauer.': 'Unesi u kom trenutku videa počinje takt. Jedan unos je dovoljan, dva ili više ga čine preciznijim.',
    'bei': 'u',
    'Zeit': 'Vreme',
    'Zeile entfernen': 'Ukloni red',
    'YouTube-Link (optional)': '«YouTube» link (opciono)',
    'Aufnahme beginnt bei Video-Zeit': 'Snimak počinje u trenutku videa',
    '+ Zeile': '+ Red',
    'Speichern': 'Sačuvaj',
    'Takt-Zeiten gespeichert.': 'Vremena taktova su sačuvana.',
    'Diese Referenz enthält die gewählten Takte nicht.': 'Ova referenca ne sadrži izabrane taktove.',
    'Wiedergabe nicht möglich: {e}': 'Reprodukcija nije moguća: {e}',
    'Wiedergabe nicht möglich.': 'Reprodukcija nije moguća.',
    'Die Datei konnte nicht gelesen werden. Unterstützt werden gängige Formate wie MP3, M4A, WAV, OGG, WebM oder MP4.': 'Fajl nije moguće pročitati. Podržani su uobičajeni formati kao «MP3, M4A, WAV, OGG, WebM» ili «MP4».',
    'Teil-Aufnahme': 'Delimičan snimak',
    'Die Aufnahme dauert {d} – kürzer als der ganze Satz. Welche Takte enthält sie?': 'Snimak traje {d} – kraće od celog stava. Koje taktove sadrži?',
    'bis': 'do',
    'Ausrichten': 'Poravnaj',
    'Abbrechen': 'Otkaži',
    'Richte Aufnahme aus …': 'Poravnavam snimak …',
    'Analysiere Aufnahme – das kann bei einem ganzen Satz 10–30 Sekunden dauern …': 'Analiziram snimak – za ceo stav to može trajati 10–30 sekundi …',
    '„{name}“ ausgerichtet: a′ ≈ {hz} Hz{trans}.{quality}': '„{name}“ je poravnat: «a′» ≈ {hz} «Hz»{trans}.{quality}',
    ' (einen Halbton tiefer)': ' (polustepen niže)',
    ' (einen Halbton höher)': ' (polustepen više)',
    ' Die Zuordnung ist unsicher – prüfe die Takt-Zeiten.': ' Poravnanje je nesigurno – proveri vremena taktova.',
    'Mitschnitt läuft – spiele jetzt die Referenz (z. B. das YouTube-Video) über Lautsprecher ab.': 'Snimanje je u toku – sada pusti referencu (npr. «YouTube» video) preko zvučnika.',
    'Mitschnitt zu kurz.': 'Snimak je prekratak.',
    'Der Mitschnitt konnte nicht ausgerichtet werden.': 'Snimak nije moguće poravnati.',
    'Mitschnitt {d}': 'Snimak {d}',
    'Das sieht nicht nach einem YouTube-Link aus.': 'Ovo ne izgleda kao «YouTube» link.',
    'Link hinzugefügt. Trage unter „Takt-Zeiten“ ein, wann Takt 1 im Video beginnt.': 'Link je dodat. U „Vremena taktova“ unesi kada u videu počinje takt 1.',
    'Referenz „{n}“ abspielen (♩. ≈ {b})': 'Pusti referencu „{n}“ (♩. ≈ {b})',

    // --- fingering popover
    'Fingersatz ändern': 'Promeni prstomet',
    'Saite': 'Žica',
    'Finger': 'Prst',
    'eigener Fingersatz': 'sopstveni prstomet',
    'Fingersatz vom Lehrer': 'prstomet nastavnika',
    'Vorschlag des Trainers': 'predlog trenera',
    'Vorschlag wiederherstellen': 'Vrati predlog',
    'Lehrer-Fingersatz wiederherstellen': 'Vrati prstomet nastavnika',
    'Fertig': 'Gotovo',

    // --- settings
    'Stimmung': 'Štimovanje',
    'Kammerton a′': 'Kamerton «a′»',
    '415 Hz (barock)': '«415 Hz» (barok)',
    'eigener Wert …': 'sopstvena vrednost …',
    'Eigener Wert (Hz)': 'Sopstvena vrednost («Hz»)',
    'Mikrofon': 'Mikrofon',
    'Eingang': 'Ulaz',
    'Standard': 'Podrazumevani',
    'Mikrofon {i}': 'Mikrofon {i}',
    'Empfindlichkeit': 'Osetljivost',
    'Tipp: Headset- und Handy-Mikrofone funktionieren. Lege das Gerät 0,5–1 m vor dich auf den Notenständer. Bei sehr leiser Erkennung die Empfindlichkeit erhöhen, bei Störgeräuschen senken.':
      'Savet: mikrofoni na slušalicama i telefonu rade. Postavi uređaj 0,5–1 «m» ispred sebe na stalak za note. Ako je prepoznavanje slabo, povećaj osetljivost, a kod šuma je smanji.',
    'Darstellung': 'Prikaz',
    'Notennamen': 'Nazivi nota',
    'Deutsch (as′′, h′)': 'Srednjoevropski («as′′, h′»)',
    'International (A♭5, B4)': 'Međunarodni («A♭5, B4»)',
    'Farbschema': 'Šema boja',
    'wie System': 'kao sistem',
    'hell': 'svetla',
    'dunkel': 'tamna',
    'Halbton-Markierungen auf dem 3D-Griffbrett': 'Oznake polustepena na «3D» hvataljci',
    'Daten': 'Podaci',
    'Eigene Fingersätze zurücksetzen': 'Resetuj sopstveni prstomet',
    'Übungsverlauf löschen': 'Obriši istoriju vežbanja',
    'Alle Daten (Einstellungen, Verlauf, Referenzaufnahmen) bleiben nur in diesem Browser auf diesem Gerät.': 'Svi podaci (podešavanja, istorija, referentni snimci) ostaju samo u ovom pregledaču na ovom uređaju.',
    'Fingersätze auf Vorschläge zurückgesetzt.': 'Prstomet je vraćen na predloge.',
    'Übungsverlauf gelöscht.': 'Istorija vežbanja je obrisana.',

    // --- help
    'So übst du mit dem Inverno-Trainer': 'Kako vežbati uz «Inverno-Trainer»',
    '<strong>Mikrofon starten</strong> (oben rechts) und den Zugriff erlauben. Kammerton in den Einstellungen anpassen, falls deine Geige nicht auf 440 Hz gestimmt ist.':
      '<strong>Uključi mikrofon</strong> (gore desno) i dozvoli pristup. Ako ti violina nije naštimovana na «440 Hz», podesi kamerton u podešavanjima.',
    '<strong>Takte wählen:</strong> Buchstaben F–N anklicken, Takte eintippen oder in den Noten über mehrere Takte ziehen. Ein Klick auf eine Note setzt den Startpunkt.':
      '<strong>Izaberi taktove:</strong> klikni na slova «F–N», upiši taktove ili prevuci preko više taktova u notama. Klik na notu postavlja početnu tačku.',
    '<strong>Ton für Ton:</strong> Spiele den markierten Ton. Die 3D-Geige zeigt Saite und Finger (blauer Ring) und wo dein Finger laut Tonhöhe gerade wirklich liegt (Punkt). Erst wenn du sauber triffst und kurz hältst, geht es weiter.':
      '<strong>Ton po ton:</strong> odsviraj označeni ton. «3D» violina pokazuje žicu i prst (plavi prsten) i gde ti je prst stvarno prema visini tona (tačka). Tek kada tačno pogodiš i kratko zadržiš, ide dalje.',
    '<strong>Passage:</strong> Tempo wählen, aufnehmen, durchspielen. Danach siehst du Note für Note, wie viele Cent du daneben lagst, falsche oder fehlende Töne, Rhythmus und deine Tendenzen pro Finger.':
      '<strong>Pasaž:</strong> izaberi tempo, snimi i odsviraj. Zatim vidiš notu po notu koliko centi si odstupio, pogrešne ili izostavljene tonove, ritam i svoje tendencije po prstima.',
    '<strong>Referenzen:</strong> Lade eine Aufnahme, der Trainer findet jeden Takt darin. Spiele jede Auswahl daraus ab, auch langsamer, oder öffne YouTube an der passenden Stelle.':
      '<strong>Reference:</strong> učitaj snimak, trener pronalazi svaki takt u njemu. Pusti svaki izbor iz njega, i sporije, ili otvori «YouTube» na odgovarajućem mestu.',
    '<strong>Fingersatz ändern:</strong> Auf eine Zahl in der Griffspur unter den Noten klicken.':
      '<strong>Promena prstometa:</strong> klikni na broj u prstometu ispod nota.',
    '<strong>Aufgaben:</strong> Lehrerinnen und Lehrer stellen unter „Aufgaben → Lehrer“ Passagen mit Hinweisen, Zieltempo und eigener Referenz-Einspielung zusammen und schicken den Plan als Datei oder Link. Schüler öffnen ihn, üben jede Aufgabe mit einem Klick und schicken ihren Fortschritt zurück.':
      '<strong>Zadaci:</strong> nastavnici u „Zadaci → Nastavnik“ sastavljaju pasaže sa napomenama, ciljnim tempom i sopstvenim referentnim snimkom i šalju plan kao fajl ili link. Učenici ga otvaraju, vežbaju svaki zadatak jednim klikom i šalju svoj napredak nazad.',
    'Tastatur: Leertaste = Start/Stopp · ← → = Ton zurück/vor · R = Zielton anhören · Esc = abbrechen': 'Tastatura: razmak = start/stop · ← → = ton nazad/napred · «R» = preslušaj ciljni ton · «Esc» = prekini',
    'Los geht’s': 'Idemo!',

    // --- selection, scene, misc
    'T. {m1}–{m2} · {n} Noten · {secs}': 't. {m1}–{m2} · nota: {n} · {secs}',
    'Abschnitt {l}, Takt {a} bis {b}': 'Odsek {l}, takt {a} do {b}',
    'Takte {a}–{b}': 'Taktovi {a}–{b}',
    'Notensystem, Takte {a} bis {b}': 'Notni sistem, taktovi {a} do {b}',
    'Mikrofonzugriff verweigert. Erlaube ihn über das Schloss-Symbol in der Adressleiste und versuche es erneut.': 'Pristup mikrofonu je odbijen. Dozvoli ga preko ikone katanca u adresnoj traci i pokušaj ponovo.',
    'Kein Mikrofon gefunden. Schließe ein Mikrofon oder Headset an.': 'Mikrofon nije pronađen. Priključi mikrofon ili slušalice sa mikrofonom.',
    'Das Mikrofon wird gerade von einer anderen Anwendung benutzt.': 'Mikrofon trenutno koristi druga aplikacija.',
    'Mikrofon konnte nicht gestartet werden.': 'Mikrofon nije moguće pokrenuti.',
    'Mikrofon nur über https:// oder lokal (file://, localhost) verfügbar.': 'Mikrofon je dostupan samo preko «https://» ili lokalno («file://, localhost»).',
    'Dieser Browser erlaubt keinen Mikrofonzugriff.': 'Ovaj pregledač ne dozvoljava pristup mikrofonu.',
    'Dieser Browser unterstützt kein Web Audio.': 'Ovaj pregledač ne podržava «Web Audio».',
    'Mikrofon ist nicht aktiv.': 'Mikrofon nije aktivan.',
    'Hinweis: Das Mikrofon funktioniert nur über https:// oder lokal geöffnet.': 'Napomena: mikrofon radi samo preko «https://» ili kada je stranica otvorena lokalno.',
    'Die 3D-Ansicht konnte nicht geladen werden (offline?). Saite und Finger stehen im Stimmgerät darunter.': '«3D» prikaz nije moguće učitati (bez interneta?). Žica i prst su navedeni u štimeru ispod.',
    '3D-Ansicht nicht verfügbar.': '«3D» prikaz nije dostupan.',
    '3D-Ansicht nicht verfügbar – three.js wurde nicht geladen.': '«3D» prikaz nije dostupan – «three.js» nije učitan.',
    '3D-Ansicht nicht verfügbar – dein Browser unterstützt kein WebGL.': '«3D» prikaz nije dostupan – tvoj pregledač ne podržava «WebGL».',
    'Die Notensatz-Bibliothek konnte nicht geladen werden. Bitte mit Internetverbindung neu laden.': 'Biblioteka za notni zapis nije učitana. Ponovo učitaj stranicu uz internet vezu.',

    // --- tasks (teacher ↔ student)
    'Rolle': 'Uloga',
    'Schüler': 'Učenik',
    'Lehrer': 'Nastavnik',
    'Übungsplan': 'Plan vežbanja',
    'Übungsplan empfangen': 'Primljen plan vežbanja',
    'von {t}': 'od {t}',
    'für {s}': 'za {s}',
    ' · mit Fingersätzen': ' · sa prstometom',
    'Dein bisheriger Plan wird ersetzt. Dein Übungsverlauf bleibt erhalten.': 'Tvoj dosadašnji plan biće zamenjen. Istorija vežbanja ostaje sačuvana.',
    'Übernehmen': 'Prihvati',
    'Verwerfen': 'Odbaci',
    'Lehrer-PIN': '«PIN» nastavnika',
    'Entsperren': 'Otključaj',
    'Der Lehrer-Bereich ist mit einer PIN geschützt.': 'Deo za nastavnike je zaštićen «PIN»-om.',
    '<strong>Noch keine Aufgaben.</strong> Deine Lehrerin oder dein Lehrer kann dir einen Übungsplan schicken – als Datei oder als Link. Öffne den Link einfach, oder lade die Datei hier:':
      '<strong>Još nema zadataka.</strong> Tvoj nastavnik ili nastavnica ti može poslati plan vežbanja – kao fajl ili kao link. Jednostavno otvori link ili učitaj fajl ovde:',
    'Übungsplan öffnen …': 'Otvori plan vežbanja …',
    'Du unterrichtest? Schalte oben auf „Lehrer“, um Aufgaben zu erstellen.': 'Predaješ? Prebaci gore na „Nastavnik“ da napraviš zadatke.',
    'bis {d}': 'do {d}',
    'Ziel erreicht': 'Cilj postignut',
    '±{t} ct': '±{t} «ct»',
    'Ziel {g}': 'cilj {g}',
    'bester {b} · zuletzt {l}': 'najbolji {b} · poslednji {l}',
    'Ton für Ton {n}× geschafft': 'ton po ton završeno {n}×',
    'Noch nicht geübt.': 'Još nije vežbano.',
    'Fortschritt an Lehrer senden': 'Pošalji napredak nastavniku',
    'mit meiner letzten Aufnahme je Aufgabe': 'sa mojim poslednjim snimkom za svaki zadatak',
    'Fortschritt teilen …': 'Podeli napredak …',
    'Anderen Plan öffnen …': 'Otvori drugi plan …',
    'Titel': 'Naslov',
    'Lehrer/in': 'Nastavnik/ca',
    'Schüler/in': 'Učenik/ca',
    'Kammerton vorgeben': 'Zadaj kamerton',
    'nicht vorgeben': 'ne zadaj',
    'Nachricht': 'Poruka',
    'z. B. „Diese Woche: Abschnitt H sauber, dann Tempo steigern.“': 'npr. „Ove nedelje: odsek «H» čisto, pa onda ubrzaj tempo.“',
    '+ Aufgabe aus Auswahl T. {m1}–{m2}': '+ Zadatak iz izbora t. {m1}–{m2}',
    'Wähle Takte in den Noten (ziehen oder Buchstaben F–N) und füge sie als Aufgabe hinzu.': 'Izaberi taktove u notama (prevlačenjem ili slovima «F–N») i dodaj ih kao zadatak.',
    'Titel der Aufgabe': 'Naslov zadatka',
    'Nach oben': 'Gore',
    'Nach unten': 'Dole',
    'Takte': 'Taktovi',
    'Tempo ♩.': 'Tempo ♩.',
    'frei': 'slobodno',
    'Toleranz ±ct': 'Tolerancija ±«ct»',
    'Ziel (Punkte)': 'Cilj (poeni)',
    'Fällig': 'Rok',
    'Üben als': 'Vežbaj kao',
    'beides': 'oba',
    'Ton für Ton ': 'ton po ton',
    'Aufnahme ': 'snimak',
    'Aktuelle Auswahl (T. {m1}–{m2}) übernehmen': 'Preuzmi trenutni izbor (t. {m1}–{m2})',
    'In Noten zeigen': 'Prikaži u notama',
    'Hinweis an den Schüler, z. B. „Lagenwechsel T. 44 langsam üben, 3. Finger tiefer.“': 'Napomena za učenika, npr. „Promenu pozicije u t. 44 vežbaj polako, 3. prst niže.“',
    'Referenz: <strong>{x}</strong>': 'Referenca: <strong>{x}</strong>',
    'keine': 'nema',
    'Eigene Einspielung': 'Sopstveni snimak',
    '(Link)': '(link)',
    'Selbst einspielen': 'Snimi referencu',
    'Datei …': 'Fajl …',
    '– vorhandene Referenz –': '– postojeća referenca –',
    'Vorhandene Referenz verknüpfen': 'Poveži postojeću referencu',
    'ab m:ss': 'od «m:ss»',
    'Startzeit im Video': 'Vreme početka u videu',
    'Meine Fingersätze mitschicken ({n} geändert – per Klick auf die Griffspur)': 'Pošalji i moj prstomet (izmenjeno: {n} – klikom na prstomet ispod nota)',
    'Plan teilen / speichern …': 'Podeli / sačuvaj plan …',
    'Link kopieren (ohne Aufnahmen)': 'Kopiraj link (bez snimaka)',
    'Die Datei enthält alle eingespielten Referenzen. Der Link passt in jede Nachricht, enthält aber nur Takte, Hinweise, Fingersätze und YouTube-Stellen.': 'Fajl sadrži sve snimljene reference. Link staje u svaku poruku, ali sadrži samo taktove, napomene, prstomet i «YouTube» mesta.',
    'Rückmeldung von Schülern': 'Povratne informacije od učenika',
    'Fortschritt eines Schülers öffnen …': 'Otvori napredak učenika …',
    'PIN ändern': 'Promeni «PIN»',
    'Lehrer-PIN festlegen': 'Postavi «PIN» nastavnika',
    'Neuer Plan': 'Novi plan',
    'Wirklich neuen Plan beginnen?': 'Zaista započeti novi plan?',
    'neue PIN (leer = keine)': 'novi «PIN» (prazno = bez)',
    'PIN speichern': 'Sačuvaj «PIN»',
    'Fortschritt von {s} · Stand {d}': 'Napredak: {s} · stanje {d}',
    'Fortschritt · Stand {d}': 'Napredak · stanje {d}',
    'keine Aufnahme': 'nema snimka',
    ' · Ton für Ton {n}×': ' · ton po ton {n}×',
    ' · letzte: Intonation {i}, Treffer {h} %': ' · poslednji: intonacija {i}, pogoci {h} %',
    'Unsauber: {x}': 'Nečisto: {x}',
    '(fehlt)': '(nedostaje)',
    '(falsch)': '(pogrešno)',
    'Keine Aufgaben im Bericht.': 'Nema zadataka u izveštaju.',
    'Bericht schließen': 'Zatvori izveštaj',
    'Aufgabe': 'Zadatak',
    'Aufgabe von {t}': 'Zadatak od {t}',
    'Abschnitt {l}: T. {m1}–{m2}': 'Odsek {l}: t. {m1}–{m2}',
    'PIN stimmt nicht.': '«PIN» nije tačan.',
    'PIN gespeichert. Beim nächsten Öffnen startet der Trainer im Schüler-Modus.': '«PIN» je sačuvan. Pri sledećem otvaranju trener se pokreće u režimu za učenike.',
    'PIN entfernt.': '«PIN» je uklonjen.',
    'Aufgabe „{t}“': 'Zadatak „{t}“',
    'Toleranz ±{x} ct': 'tolerancija ±{x} «ct»',
    'Tempo ♩. = {x}': 'tempo ♩. = {x}',
    ' (Vorgabe)': ' (zadato)',
    'Es läuft bereits eine Aufnahme.': 'Snimanje je već u toku.',
    'Aufnahme abgebrochen.': 'Snimanje je prekinuto.',
    'Referenz gespeichert (deine Intonation: {i}, Treffer {h} %).': 'Referenca je sačuvana (tvoja intonacija: {i}, pogoci {h} %).',
    'Referenz {t} · T. {m1}–{m2}': 'Referenca {t} · t. {m1}–{m2}',
    'Die Datei ist zu groß (max. 80 MB).': 'Fajl je prevelik (najviše «80 MB»).',
    'Die Datei ist zu groß.': 'Fajl je prevelik.',
    'Analysiere Referenz …': 'Analiziram referencu …',
    'Referenz hinterlegt.': 'Referenca je sačuvana.',
    'Die Datei konnte nicht gelesen werden.': 'Fajl nije moguće pročitati.',
    'Füge zuerst mindestens eine Aufgabe hinzu.': 'Prvo dodaj bar jedan zadatak.',
    'Gespeichert als „{name}“. Schick die Datei z. B. per Mail oder Messenger.': 'Sačuvano kao „{name}“. Pošalji fajl npr. mejlom ili porukom.',
    'Übungsplan: {t}': 'Plan vežbanja: {t}',
    'Der Plan ist zu groß für einen Link – nutze „Plan teilen / speichern“.': 'Plan je prevelik za link – koristi „Podeli / sačuvaj plan“.',
    'Hinweis: Der Link zeigt auf eine Datei auf diesem Rechner. Für Schüler die App online stellen (siehe README).': 'Napomena: link pokazuje na fajl na ovom računaru. Za učenike postavi aplikaciju na internet (vidi «README»).',
    'Link kopiert ({kb} kB). Aufnahmen sind nur in der Datei enthalten.': 'Link je kopiran ({kb} «kB»). Snimci su samo u fajlu.',
    'Link kopiert.': 'Link je kopiran.',
    'Kopieren nicht möglich.': 'Kopiranje nije moguće.',
    'Das ist kein Übungsplan für dieses Stück.': 'Ovo nije plan vežbanja za ovo delo.',
    'Der Link enthält keinen gültigen Übungsplan.': 'Link ne sadrži važeći plan vežbanja.',
    'Plan übernommen · Kammerton auf {hz} Hz gesetzt (Vorgabe).': 'Plan je prihvaćen · kamerton je postavljen na {hz} «Hz» (zadato).',
    'Übungsplan übernommen.': 'Plan vežbanja je prihvaćen.',
    'Gespeichert als „{name}“. Schick die Datei deiner Lehrerin / deinem Lehrer.': 'Sačuvano kao „{name}“. Pošalji fajl svom nastavniku ili nastavnici.',
    'Fortschritt: {t}': 'Napredak: {t}',
    'Der Bericht gehört zu einem anderen Stück.': 'Izveštaj pripada drugom delu.',
  };

  // Plural forms: de [one, other] · sr [one, few, many]
  const PLURALS = {
    'Aufgabe': { de: ['{n} Aufgabe', '{n} Aufgaben'], sr: ['{n} zadatak', '{n} zadatka', '{n} zadataka'] },
    'Aufnahme': { de: ['{n} Aufnahme', '{n} Aufnahmen'], sr: ['{n} snimak', '{n} snimka', '{n} snimaka'] },
    'Ton': { de: ['{n} Ton', '{n} Töne'], sr: ['{n} ton', '{n} tona', '{n} tonova'] },
    'Note': { de: ['{n} Note', '{n} Noten'], sr: ['{n} nota', '{n} note', '{n} nota'] },
  };

  // ------------------------------------------------------------------ transliteration
  const LAT2CYR = {
    'dž': 'џ', 'Dž': 'Џ', 'DŽ': 'Џ', 'lj': 'љ', 'Lj': 'Љ', 'LJ': 'Љ', 'nj': 'њ', 'Nj': 'Њ', 'NJ': 'Њ',
    a: 'а', b: 'б', c: 'ц', 'č': 'ч', 'ć': 'ћ', d: 'д', 'đ': 'ђ', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л',
    m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', 'š': 'ш', t: 'т', u: 'у', v: 'в', z: 'з', 'ž': 'ж',
    A: 'А', B: 'Б', C: 'Ц', 'Č': 'Ч', 'Ć': 'Ћ', D: 'Д', 'Đ': 'Ђ', E: 'Е', F: 'Ф', G: 'Г', H: 'Х', I: 'И', J: 'Ј', K: 'К', L: 'Л',
    M: 'М', N: 'Н', O: 'О', P: 'П', R: 'Р', S: 'С', 'Š': 'Ш', T: 'Т', U: 'У', V: 'В', Z: 'З', 'Ž': 'Ж',
  };
  function translitWord(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const two = s.slice(i, i + 2);
      if (LAT2CYR[two]) { out += LAT2CYR[two]; i++; continue; }
      out += LAT2CYR[s[i]] || s[i];
    }
    return out;
  }
  /** Latin → Cyrillic, leaving HTML tags, {placeholders}, «literals» and URLs untouched. */
  function toCyr(s) {
    return s.split(/(<[^>]*>|\{\w+\}|«[^»]*»|https?:\/\/\S+)/).map(part => {
      if (!part) return '';
      if (part[0] === '<' || part[0] === '{' || part[0] === '«' || /^https?:/.test(part)) return part;
      return translitWord(part);
    }).join('');
  }
  const stripLiterals = s => s.replace(/[«»]/g, '');

  // ------------------------------------------------------------------ state
  const LANGS = { de: { locale: 'de-DE', html: 'de' }, sr: { locale: 'sr-Latn-RS', html: 'sr-Latn' }, 'sr-Cyrl': { locale: 'sr-Cyrl-RS', html: 'sr-Cyrl' } };
  let lang = 'de';
  try {
    const saved = JSON.parse(localStorage.getItem('inverno.lang') || 'null');
    if (saved && LANGS[saved]) lang = saved;
    else if (/^sr\b/i.test(navigator.language || '')) lang = /cyrl/i.test(navigator.language) ? 'sr-Cyrl' : 'sr';
  } catch (_) { /* default */ }
  const listeners = new Set();

  function finish(s) {
    if (lang === 'sr-Cyrl') s = toCyr(s);
    return stripLiterals(s);
  }
  function fill(s, params) {
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m)) : s;
  }
  /** Translate a German source string (template with {placeholders}). */
  function t(key, params) {
    let s = key;
    if (lang !== 'de') {
      const v = SR[key];
      if (v != null) s = v;
      s = finish(s);
    }
    return fill(s, params);
  }
  /** Plural-aware: tn('Aufgabe', 3) → "3 Aufgaben" / "3 zadatka". */
  function tn(word, n, params) {
    const p = PLURALS[word];
    if (!p) return fill(word, Object.assign({ n }, params));
    let s;
    if (lang === 'de') s = n === 1 ? p.de[0] : p.de[1];
    else {
      const m10 = n % 10, m100 = n % 100;
      s = m10 === 1 && m100 !== 11 ? p.sr[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? p.sr[1] : p.sr[2];
      s = finish(s);
    }
    return fill(s, Object.assign({ n }, params));
  }

  // static markup: data-t (text), data-t-html (inner HTML), data-t-attr="aria-label,title,placeholder"
  const originals = new WeakMap();
  function apply(root = document) {
    root.querySelectorAll('[data-t], [data-t-html], [data-t-attr]').forEach(el => {
      let o = originals.get(el);
      if (!o) {
        o = {};
        if (el.hasAttribute('data-t')) o.text = el.getAttribute('data-t') || el.textContent.trim();
        if (el.hasAttribute('data-t-html')) o.html = el.innerHTML.trim();
        if (el.hasAttribute('data-t-attr')) {
          o.attrs = {};
          for (const a of el.getAttribute('data-t-attr').split(',').map(x => x.trim()).filter(Boolean)) o.attrs[a] = el.getAttribute(a) || '';
        }
        originals.set(el, o);
      }
      if (o.text != null) el.textContent = t(o.text);
      if (o.html != null) el.innerHTML = t(o.html);
      if (o.attrs) for (const a in o.attrs) el.setAttribute(a, t(o.attrs[a]));
    });
    document.documentElement.lang = LANGS[lang].html;
  }

  IT.i18n = {
    t, tn, apply, toCyr,
    get lang() { return lang; },
    get locale() { return LANGS[lang].locale; },
    setLang(l) {
      if (!LANGS[l] || l === lang) return;
      lang = l;
      try { localStorage.setItem('inverno.lang', JSON.stringify(l)); } catch (_) { /* ignore */ }
      apply();
      for (const fn of listeners) fn(l);
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    _dict: SR,
  };
  IT.t = t;
  IT.tn = tn;
})();
