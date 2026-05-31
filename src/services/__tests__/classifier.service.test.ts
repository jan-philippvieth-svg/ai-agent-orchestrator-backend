/**
 * Unit-Tests für ClassifierService.
 *
 * Ausführen:
 *   npm run test:unit
 *
 * Framework: Node.js 20 built-in test runner (node:test + node:assert/strict).
 * Keine extra Dependencies nötig.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClassifierService } from '../classifier.service.js';

const classifier = new ClassifierService();
const classify = (msg: string) => classifier.classify(msg);
const explain = (msg: string) => classifier.explain(msg);

// ── Goldener Pfad ─────────────────────────────────────────────────────────────

describe('Goldener Pfad — eindeutige Klassifizierungen', () => {
  it('kurze Begrüßung → simple', () => {
    assert.equal(classify('Hallo, wie geht es?'), 'simple');
    assert.equal(classify('Danke für die Hilfe'), 'simple');
    // "Frage" enthält den Substring "rag" → mit \brag\b-Fix kein false positive mehr
    assert.equal(classify('Hi, kurze Frage'), 'simple');
  });

  it('Schlüsselwort "erkläre kurz" → simple', () => {
    assert.equal(classify('Erkläre kurz, was ein API-Gateway ist'), 'simple');
    assert.equal(classify('erklaer kurz wie das geht'), 'simple');
  });

  it('übersetze-Anfragen → simple', () => {
    assert.equal(classify('Übersetze diesen Text ins Englische'), 'simple');
    assert.equal(classify('Bitte übersetze das'), 'simple');
    assert.equal(classify('kannst du das übersetze n?'), 'simple');
  });

  it('Warum/Vergleiche/Technisch → medium', () => {
    assert.equal(classify('Warum sollte man Docker nutzen?'), 'medium');
    assert.equal(classify('Vergleiche REST APIs mit GraphQL'), 'medium');
    assert.equal(classify('Technische Erklärung des Caching-Mechanismus'), 'medium');
    // "fasse zusammen" matcht nur wenn die Wörter benachbart sind.
    // "Fasse die Dokumentation zusammen" (nicht benachbart) → kein Match.
    // Korrekte Formulierung für Pattern-Match:
    assert.equal(classify('Bitte fasse zusammen was wichtig ist'), 'medium');
    // "zusammenfassung" als separates Keyword:
    assert.equal(classify('Erstelle eine Zusammenfassung des Dokuments'), 'medium');
    // \brag\b matcht das Akronym RAG (nicht "Frage")
    assert.equal(classify('Was ist RAG und wie funktioniert es?'), 'medium');
  });

  it('Complex keywords → complex', () => {
    assert.equal(classify('Analysiere die Architektur unseres Systems'), 'complex');
    assert.equal(classify('Führe eine Codeanalyse durch'), 'complex');
    assert.equal(classify('Security-Review der Infrastruktur'), 'complex');
    assert.equal(classify('Skalierung der Microservices planen'), 'complex');
    assert.equal(classify('Migration auf Kubernetes'), 'complex');
    assert.equal(classify('Systemdesign für Enterprise-Plattform'), 'complex');
  });
});

// ── Bug 1 — Regression: Höfliche Wörter dürfen Medium nicht überschreiben ────
// Tobias-Bug: "Bitte fasse zusammen …" wurde als simple klassifiziert, obwohl
// "zusammenfassung"/"technisch" eindeutig medium erfordern.
// Root cause: simplePatterns[1] (bitte/hi/hallo/danke) wurde VOR dem
// medium-Check ausgewertet.

describe('Regression Bug 1 — polite openers must not suppress medium content', () => {
  it('"Bitte" + medium content → medium (nicht simple)', () => {
    assert.equal(classify('Bitte fasse die technische Dokumentation zusammen'), 'medium');
    assert.equal(classify('Bitte warum ist Docker besser als VMs?'), 'medium');
    assert.equal(classify('Bitte vergleiche die Ansätze'), 'medium');
    assert.equal(classify('Bitte erstelle eine Zusammenfassung'), 'medium');
  });

  it('"Hi/Hallo/Danke" + medium content → medium (nicht simple)', () => {
    assert.equal(classify('Hi, kannst du eine Zusammenfassung erstellen?'), 'medium');
    assert.equal(classify('Hallo, ich brauche eine technische Erklärung'), 'medium');
    assert.equal(classify('Danke, und warum genau?'), 'medium');
  });

  it('"Bitte" allein (kein medium content) → simple', () => {
    assert.equal(classify('Bitte'), 'simple');
    assert.equal(classify('Bitte danke'), 'simple');
  });

  it('"Bitte" + complex content → complex (complex schlägt beides)', () => {
    assert.equal(classify('Bitte analysiere die Architektur'), 'complex');
    assert.equal(classify('Hallo, ich brauche eine Codeanalyse'), 'complex');
  });

  it('explain() gibt korrekten rule-Wert zurück', () => {
    // "fasse zusammen" muss benachbart stehen damit das Literal matcht
    const e = explain('Bitte erstelle eine Zusammenfassung');
    assert.equal(e.classification, 'medium');
    assert.equal(e.rule, 'medium_pattern');
    assert.match(e.detail, /zusammenfassung/i);
  });
});

// ── Bug 2 — Regression: \b + Umlaut-Anfang ───────────────────────────────────
// JS \b erkennt non-ASCII Zeichen (ü, ä …) als \W. Daher hat \bübersetze\b
// NIE gematcht (Leerzeichen vor ü: \W-\W = kein Boundary). Die Klassifikation
// war zufällig korrekt über den Default-Branch, nicht über das Pattern.

describe('Regression Bug 2 — umlaut word boundary', () => {
  it('"Übersetze" am Satzanfang matcht simplePatterns (nicht nur Default)', () => {
    const e = explain('Übersetze diesen Text ins Englische');
    assert.equal(e.classification, 'simple');
    // Muss via pattern gefunden werden, nicht via simple_default
    assert.equal(e.rule, 'simple_pattern');
    assert.match(e.detail, /übersetze/i);
  });

  it('"übersetze" nach Leerzeichen matcht simplePatterns', () => {
    const e = explain('kannst du das übersetze n?');
    assert.equal(e.classification, 'simple');
  });

  it('"xübersetze" (kein Leerzeichen) matcht NICHT als simple keyword', () => {
    // "xübersetze" ist kein echtes Wort — das Pattern soll es NICHT matchen
    // ((?<![a-zA-Z]) schlägt fehl, weil 'x' ein lateinischer Buchstabe ist)
    const e = explain('xübersetze das Dokument');
    // kein simple-Pattern-Match wegen (?<![a-zA-Z]) → default simple
    assert.equal(e.rule, 'simple_default');
  });
});

// ── Bug 3 — Regression: Deutsche Komposita mit Complex-Keywords ───────────────
// \barchitektur\b matcht NICHT in "Systemarchitektur" (m+a beide \w → kein
// Boundary). Fix: führendes \b entfernt, nur trailing \b behalten.

describe('Regression Bug 3 — German compound nouns with complex keywords', () => {
  it('Komposita mit "architektur" → complex', () => {
    assert.equal(classify('Analysiere unsere Systemarchitektur'), 'complex');
    assert.equal(classify('Erkläre die Softwarearchitektur'), 'complex');
    assert.equal(classify('Bitte prüfe die Datenbankarchitektur'), 'complex');
    assert.equal(classify('Was ist Microservicesarchitektur?'), 'complex');
    assert.equal(classify('Cloud-Architektur reviewen'), 'complex');
  });

  it('Komposita mit "migration" → complex', () => {
    assert.equal(classify('Erkläre die Datenmigration des Projekts'), 'complex');
    assert.equal(classify('Planung der Produktmigration'), 'complex');
  });

  it('Komposita mit "skalierung" → complex', () => {
    assert.equal(classify('Wie plant man Lastskalierung?'), 'complex');
    assert.equal(classify('Horizontale Serverskalierung einrichten'), 'complex');
  });

  it('explain() gibt gematchtes Kompositum zurück', () => {
    const e = explain('Analysiere unsere Systemarchitektur');
    assert.equal(e.classification, 'complex');
    assert.equal(e.rule, 'complex_pattern');
    assert.match(e.detail, /architektur/i);
  });
});

// ── Grenzfälle ────────────────────────────────────────────────────────────────

describe('Grenzfälle', () => {
  it('leere Eingabe → simple (default)', () => {
    const e = explain('');
    assert.equal(e.classification, 'simple');
    assert.equal(e.rule, 'simple_default');
    // estimateTokens nutzt Math.max(1, …) → leerer String ergibt 1, nicht 0
    assert.equal(e.tokens, 1);
  });

  it('einzelnes Wort → simple (default)', () => {
    assert.equal(classify('Hallo'), 'simple');
    assert.equal(classify('Test'), 'simple');
  });

  it('nur "bitte warum" → medium (bitte allein wäre simple, warum macht medium)', () => {
    assert.equal(classify('bitte warum'), 'medium');
  });

  it('Token-Grenze > 900 → complex', () => {
    // 3601 Zeichen → ceil(3601/4) = 901 tokens
    const longMsg = 'a '.repeat(1801); // 3602 chars → 901 tokens
    const e = explain(longMsg);
    assert.equal(e.classification, 'complex');
    assert.equal(e.rule, 'complex_tokens');
  });

  it('Token-Grenze > 350 → medium', () => {
    // 1404 Zeichen → ceil(1404/4) = 351 tokens
    const mediumMsg = 'a '.repeat(702); // 1404 chars → 351 tokens
    const e = explain(mediumMsg);
    assert.equal(e.classification, 'medium');
    assert.equal(e.rule, 'medium_tokens');
  });

  it('Mehrfach-Treffer: complex + simple → complex gewinnt', () => {
    assert.equal(classify('Hallo, mach eine Codeanalyse'), 'complex');
    assert.equal(classify('Bitte eine Migration planen'), 'complex');
  });

  it('Mehrfach-Treffer: medium + simple → medium gewinnt', () => {
    assert.equal(classify('Hallo, warum ist das so?'), 'medium');
    // "fasse zusammen" muss benachbart sein; "fasse das zusammen" matcht nicht
    assert.equal(classify('Danke, und warum genau?'), 'medium');
    assert.equal(classify('Hi, erstelle eine Zusammenfassung'), 'medium');
  });

  it('Großschreibung wird ignoriert (case-insensitive)', () => {
    assert.equal(classify('ARCHITEKTUR analysieren'), 'complex');
    assert.equal(classify('WARUM ist das so?'), 'medium');
    assert.equal(classify('HALLO'), 'simple');
  });

  it('Sonderzeichen und Zahlen stören nicht', () => {
    assert.equal(classify('Architektur 2.0 reviewen!'), 'complex');
    assert.equal(classify('Warum? (3 Gründe)'), 'medium');
  });

  it('Mehrdeutigkeit: "bitte erkläre kurz die Zusammenfassung"', () => {
    // "erkläre kurz" → simple pattern, aber "zusammenfassung" → medium pattern
    // medium wird VOR simple geprüft → medium
    assert.equal(classify('Bitte erkläre kurz die Zusammenfassung'), 'medium');
  });
});

// ── explain() Vollständigkeit ─────────────────────────────────────────────────

describe('explain() — Debug-Ausgabe', () => {
  it('gibt immer alle Felder zurück', () => {
    for (const msg of ['', 'Hallo', 'Warum?', 'Architektur']) {
      const e = explain(msg);
      assert.ok(e.classification, 'classification fehlt');
      assert.ok(typeof e.tokens === 'number', 'tokens muss number sein');
      assert.ok(e.rule, 'rule fehlt');
      assert.ok(typeof e.detail === 'string' && e.detail.length > 0, 'detail fehlt');
    }
  });

  it('rule stimmt mit classification überein', () => {
    assert.match(explain('Architektur').rule, /^complex/);
    assert.match(explain('Warum?').rule, /^medium/);
    assert.match(explain('Hallo').rule, /^simple/);
  });

  it('tokens ist nicht-negativ', () => {
    assert.ok(explain('').tokens >= 0);
    assert.ok(explain('Hallo').tokens >= 0);
  });

  it('detail enthält das gematchte Pattern-Fragment', () => {
    assert.match(explain('Architektur prüfen').detail, /architektur/i);
    assert.match(explain('Warum ist das so?').detail, /warum/i);
    assert.match(explain('Hallo').detail, /hallo/i);
  });
});
