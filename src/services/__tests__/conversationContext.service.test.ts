/**
 * Tests für ConversationContextService — Follow-up Resolution.
 *
 * Ausführen: npm run test:unit:context
 * (oder beide Test-Suites: npm run test:unit:all)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClassifierService } from '../classifier.service.js';
import { ConversationContextService } from '../conversationContext.service.js';
import type { ConversationMessage } from '../../types/index.js';

// Frische Instanz pro Testlauf (umgeht den Singleton für isolierte Tests)
function freshService(): ConversationContextService {
  // Nutze eine neue Instanz, nicht den Singleton, um Test-Isolation zu gewährleisten
  return new (ConversationContextService as unknown as new () => ConversationContextService)();
}

const classifier = new ClassifierService();

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function history(...pairs: [string, string][]): ConversationMessage[] {
  return pairs.flatMap(([user, assistant]) => [
    { role: 'user' as const, content: user },
    { role: 'assistant' as const, content: assistant },
  ]);
}

// ── Test A: Zeitraum-Follow-up ────────────────────────────────────────────────

describe('Test A — Zeitraum-Follow-up', () => {
  it('resolvedIntent enthält den Topic und die Spezifizierung', () => {
    const svc = freshService();
    const hist = history(
      ['Analysiere die Umsatzentwicklung', 'Für welchen Zeitraum? Vorschlag: dieses Jahr.'],
    );
    const result = svc.resolve('Dieses Jahr', hist);

    assert.ok(result.isFollowUp, 'isFollowUp muss true sein');
    assert.ok(
      result.resolvedIntent.includes('Analysiere die Umsatzentwicklung'),
      `resolvedIntent muss Topic enthalten: "${result.resolvedIntent}"`,
    );
    assert.ok(
      result.resolvedIntent.includes('Dieses Jahr'),
      `resolvedIntent muss Follow-up enthalten: "${result.resolvedIntent}"`,
    );
  });

  it('contextForPrompt enthält die vorherigen Nachrichten', () => {
    const svc = freshService();
    const hist = history(
      ['Analysiere die Umsatzentwicklung', 'Für welchen Zeitraum?'],
    );
    const result = svc.resolve('Dieses Jahr', hist);
    assert.ok(result.recentTurns.length > 0, 'recentTurns darf nicht leer sein');
  });
});

// ── Test B: Modell-Routing bleibt medium/large ────────────────────────────────

describe('Test B — Routing bleibt medium (Vergleich-Topic)', () => {
  it('"Performance" als Follow-up → resolvedIntent klassifiziert als medium', () => {
    const svc = freshService();
    const hist = history(
      ['Vergleiche Docker und VM', 'Soll ich Fokus auf Kosten oder Performance legen?'],
    );
    const result = svc.resolve('Performance', hist);

    assert.ok(result.isFollowUp, 'isFollowUp muss true sein');
    assert.ok(
      result.resolvedIntent.includes('Vergleiche Docker und VM'),
      `resolvedIntent enthält Topic: "${result.resolvedIntent}"`,
    );

    const cls = classifier.classify(result.resolvedIntent);
    assert.equal(cls, 'medium', `Routing muss medium sein, ist: ${cls} (intent: "${result.resolvedIntent}")`);
  });

  it('"Kosten" als Follow-up → ebenfalls medium', () => {
    const svc = freshService();
    const hist = history(['Vergleiche Docker und VM', 'Kosten oder Performance?']);
    const result = svc.resolve('Kosten', hist);
    assert.equal(classifier.classify(result.resolvedIntent), 'medium');
  });
});

// ── Test C: Kontext bleibt erhalten ──────────────────────────────────────────

describe('Test C — Kontext bleibt erhalten (Zusammenfassung)', () => {
  it('"Kurzfassung" als Follow-up — contextForPrompt enthält Geschichte', () => {
    const svc = freshService();
    const hist = history(
      ['Fasse die technische Dokumentation zusammen',
       'Soll ich eine Kurzfassung oder Detailfassung erstellen?'],
    );
    const result = svc.resolve('Kurzfassung', hist);

    assert.ok(result.isFollowUp, 'isFollowUp muss true sein');
    assert.ok(result.recentTurns.length >= 2, 'recentTurns muss min. 2 Nachrichten enthalten');

    // Topic enthält "technisch" → medium-Klassifikation
    const cls = classifier.classify(result.resolvedIntent);
    assert.equal(cls, 'medium');
  });

  it('resolvedIntent verbindet Topic und Spezifizierung', () => {
    const svc = freshService();
    const hist = history(
      ['Fasse die technische Dokumentation zusammen', 'Kurz oder Detailfassung?'],
    );
    const { resolvedIntent } = svc.resolve('Kurzfassung', hist);
    assert.ok(resolvedIntent.includes('Fasse die technische Dokumentation'));
    assert.ok(resolvedIntent.includes('Kurzfassung'));
  });
});

// ── Test D: "Hallo" → simple, kein Follow-up ─────────────────────────────────

describe('Test D — "Hallo" ohne Kontext', () => {
  it('leere History → kein Follow-up, Klassifikation simple', () => {
    const svc = freshService();
    const result = svc.resolve('Hallo', []);

    assert.equal(result.isFollowUp, false, 'kein Follow-up ohne History');
    assert.equal(result.resolvedIntent, 'Hallo', 'resolvedIntent == originale Nachricht');
    assert.equal(classifier.classify(result.resolvedIntent), 'simple');
  });

  it('"Hallo" mit History ist trotzdem kein Follow-up', () => {
    const svc = freshService();
    const hist = history(['Was ist Docker?', 'Docker ist eine Container-Plattform.']);
    const result = svc.resolve('Hallo', hist);
    // "Hallo" passt nicht zu FOLLOWUP_PATTERNS → kein Follow-up
    assert.equal(result.isFollowUp, false);
  });
});

// ── Test E: "OK" ohne Rückfrage → simple/default ─────────────────────────────

describe('Test E — "OK" ohne vorherige Rückfrage', () => {
  it('keine History → kein Follow-up', () => {
    const svc = freshService();
    const result = svc.resolve('OK', []);
    assert.equal(result.isFollowUp, false);
    assert.equal(result.resolvedIntent, 'OK');
    assert.equal(classifier.classify(result.resolvedIntent), 'simple');
  });

  it('"OK" mit History → isFollowUp true, resolvedIntent enthält Topic', () => {
    const svc = freshService();
    const hist = history(['Erstelle einen Report', 'Soll ich PDF oder CSV verwenden?']);
    const result = svc.resolve('OK', hist);
    assert.ok(result.isFollowUp);
    assert.ok(result.resolvedIntent.includes('Erstelle einen Report'));
  });
});

// ── Follow-up-Erkennung (isFollowUpMessage) ───────────────────────────────────

describe('isFollowUpMessage — Einzelfälle', () => {
  it('Bestätigungswörter → true', () => {
    const svc = freshService();
    for (const m of ['Ja', 'Nein', 'OK', 'Okay', 'Genau', 'Gut', 'Passt', 'Stimmt', 'Klar', 'Gerne']) {
      assert.ok(svc.isFollowUpMessage(m), `"${m}" sollte als Follow-up erkannt werden`);
    }
  });

  it('Zeit-/Referenzangaben → true', () => {
    const svc = freshService();
    for (const m of ['Dieses Jahr', 'Letztes Quartal', 'Nächstes Jahr']) {
      assert.ok(svc.isFollowUpMessage(m), `"${m}" sollte als Follow-up erkannt werden`);
    }
  });

  it('Auswahl-Antworten → true', () => {
    const svc = freshService();
    for (const m of ['Performance', 'Kosten', 'Kurzfassung', 'Detailfassung']) {
      assert.ok(svc.isFollowUpMessage(m), `"${m}" sollte als Follow-up erkannt werden`);
    }
  });

  it('vollständige Fragen/Aussagen → false', () => {
    const svc = freshService();
    const nonFollowUps = [
      'Analysiere die Systemarchitektur',
      'Erkläre mir, was RAG bedeutet',
      'Warum ist Docker besser als VMs?',
      'Fasse die technische Dokumentation zusammen',
      'Was ist der Unterschied zwischen REST und GraphQL?',
    ];
    for (const m of nonFollowUps) {
      assert.equal(svc.isFollowUpMessage(m), false, `"${m}" sollte KEIN Follow-up sein`);
    }
  });
});

// ── Server-seitige History (addTurn / getHistory) ─────────────────────────────

describe('Server-seitige History', () => {
  it('addTurn → getHistory gibt gespeicherte Nachrichten zurück', () => {
    const svc = freshService();
    const id = 'conv-test-1';
    svc.addTurn(id, 'Was ist Docker?', 'Docker ist eine Container-Plattform.');

    const hist = svc.getHistory(id);
    assert.equal(hist.length, 2);
    assert.equal(hist[0].role, 'user');
    assert.equal(hist[0].content, 'Was ist Docker?');
    assert.equal(hist[1].role, 'assistant');
  });

  it('mehrere Turns werden korrekt akkumuliert', () => {
    const svc = freshService();
    const id = 'conv-test-2';
    svc.addTurn(id, 'Frage 1', 'Antwort 1');
    svc.addTurn(id, 'Frage 2', 'Antwort 2');

    const hist = svc.getHistory(id);
    assert.equal(hist.length, 4);
    assert.equal(hist[2].content, 'Frage 2');
  });

  it('unbekannte conversationId → leeres Array', () => {
    const svc = freshService();
    assert.deepEqual(svc.getHistory('unbekannt-xyz'), []);
  });

  it('History nutzt resolvedIntent für Follow-up der nächsten Nachricht', () => {
    const svc = freshService();
    const id = 'conv-test-3';
    svc.addTurn(id, 'Vergleiche REST und GraphQL', 'Worauf soll ich fokussieren?');

    const hist = svc.getHistory(id);
    const result = svc.resolve('Performance', hist);
    assert.ok(result.isFollowUp);
    assert.ok(result.resolvedIntent.includes('Vergleiche REST und GraphQL'));
  });
});

// ── Mehrfach-Follow-up-Kette ──────────────────────────────────────────────────

describe('Mehrfach-Follow-up — Topic-Suche geht rückwärts', () => {
  it('Kette von Follow-ups findet das originale Topic', () => {
    const svc = freshService();
    const hist: ConversationMessage[] = [
      { role: 'user', content: 'Analysiere die Softwarearchitektur' },
      { role: 'assistant', content: 'Welchen Fokus?' },
      { role: 'user', content: 'Performance' },   // follow-up 1
      { role: 'assistant', content: 'Zeitraum?' },
    ];
    const result = svc.resolve('Dieses Jahr', hist);

    // "Performance" ist selbst ein Follow-up → muss weiter zurückgehen zu "Analysiere..."
    assert.ok(result.isFollowUp);
    assert.ok(
      result.resolvedIntent.includes('Analysiere die Softwarearchitektur'),
      `resolvedIntent muss Ur-Topic enthalten: "${result.resolvedIntent}"`,
    );
  });
});

// ── Test F: ConversationSummary ───────────────────────────────────────────────

describe('Test F — ConversationSummary', () => {
  it('kurze History (≤6 Nachrichten) → summary ist undefined', () => {
    const svc = freshService();
    const id = 'conv-summary-short';
    svc.addTurn(id, 'Was ist Docker?', 'Docker ist eine Container-Plattform.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Hallo', hist, id);
    assert.equal(result.summary, undefined, 'summary muss undefined sein bei kurzer History');
  });

  it('8+ gespeicherte Nachrichten → summary.text ist nicht leer', () => {
    const svc = freshService();
    const id = 'conv-summary-long';
    for (let i = 1; i <= 5; i++) {
      svc.addTurn(id, `Analysiere die Umsatzentwicklung im Quartal ${i}`, `Die Umsatzentwicklung zeigt einen Anstieg im Quartal ${i}.`);
    }
    const hist = svc.getHistory(id);
    // 5 turns = 10 messages; archive = first 4 messages
    const result = svc.resolve('Dieses Jahr', hist, id);

    assert.ok(result.summary !== undefined, 'summary muss gesetzt sein');
    assert.ok(result.summary.text.length > 0, 'summary.text darf nicht leer sein');
  });

  it('summary.coveredMessages entspricht der Archivgröße', () => {
    const svc = freshService();
    const id = 'conv-summary-covered';
    for (let i = 1; i <= 5; i++) {
      svc.addTurn(id, `Frage ${i}`, `Antwort ${i}`);
    }
    const hist = svc.getHistory(id);
    const archiveSize = hist.length - 6; // PROMPT_CONTEXT_MESSAGES = 6
    const result = svc.resolve('OK', hist, id);

    assert.ok(result.summary !== undefined);
    assert.equal(result.summary.coveredMessages, archiveSize,
      `coveredMessages muss ${archiveSize} sein, ist: ${result.summary?.coveredMessages}`);
  });

  it('summary.text enthält Inhalt aus archivierten Nachrichten', () => {
    const svc = freshService();
    const id = 'conv-summary-content';
    for (let i = 1; i <= 5; i++) {
      svc.addTurn(id, `Erkläre Microservices Schritt ${i}`, `Microservices sind unabhängige Dienste Schritt ${i}.`);
    }
    const hist = svc.getHistory(id);
    const result = svc.resolve('Details', hist, id);

    assert.ok(result.summary !== undefined);
    // Archived messages mention "Microservices" — summary should include it
    assert.ok(
      result.summary.text.includes('Microservices') || result.summary.text.includes('Erkläre'),
      `summary.text muss archivierten Inhalt enthalten: "${result.summary.text.slice(0, 100)}"`,
    );
  });
});

// ── Test G: SessionFacts ──────────────────────────────────────────────────────

describe('Test G — SessionFacts', () => {
  it('topic wird aus erster substantieller Nachricht gesetzt', () => {
    const svc = freshService();
    const id = 'conv-facts-topic';
    svc.addTurn(id, 'Analysiere die Umsatzentwicklung', 'Ich analysiere das gerne.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Dieses Jahr', hist, id);

    assert.ok(result.facts.topic !== undefined, 'topic muss gesetzt sein');
    assert.ok(
      result.facts.topic.includes('Analysiere'),
      `topic muss ersten Satz enthalten: "${result.facts.topic}"`,
    );
  });

  it('"dieses Jahr" → timeContext === "dieses Jahr"', () => {
    const svc = freshService();
    const id = 'conv-facts-time';
    svc.addTurn(id, 'Zeige mir die Umsätze für dieses Jahr', 'Gerne zeige ich dir das.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Details', hist, id);

    assert.equal(result.facts.timeContext, 'dieses Jahr',
      `timeContext muss "dieses Jahr" sein, ist: "${result.facts.timeContext}"`);
  });

  it('"letztes Quartal" → timeContext === "letztes Quartal"', () => {
    const svc = freshService();
    const id = 'conv-facts-time2';
    svc.addTurn(id, 'Vergleiche letztes Quartal mit diesem', 'Ich vergleiche das.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('OK', hist, id);
    assert.equal(result.facts.timeContext, 'letztes Quartal');
  });

  it('"Kurzfassung" → detailLevel === "brief"', () => {
    const svc = freshService();
    const id = 'conv-facts-brief';
    svc.addTurn(id, 'Ich brauche eine Kurzfassung des Reports', 'Ich erstelle eine kurze Version.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Ja', hist, id);
    assert.equal(result.facts.detailLevel, 'brief',
      `detailLevel muss "brief" sein, ist: "${result.facts.detailLevel}"`);
  });

  it('"technische Details" → detailLevel === "technical"', () => {
    const svc = freshService();
    const id = 'conv-facts-technical';
    svc.addTurn(id, 'Erkläre die technische Architektur im Detail', 'Ich erkläre das ausführlich.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Weiter', hist, id);
    assert.equal(result.facts.detailLevel, 'technical');
  });

  it('facts.lastUpdatedAt ist ein gültiger ISO-Timestamp', () => {
    const svc = freshService();
    const id = 'conv-facts-timestamp';
    svc.addTurn(id, 'Hallo', 'Hallo!');
    const hist = svc.getHistory(id);
    const result = svc.resolve('OK', hist, id);

    const ts = Date.parse(result.facts.lastUpdatedAt);
    assert.ok(!Number.isNaN(ts), `lastUpdatedAt muss ein gültiger Timestamp sein: "${result.facts.lastUpdatedAt}"`);
  });

  it('facts.entities ist ein Array (auch bei kurzen Nachrichten)', () => {
    const svc = freshService();
    const id = 'conv-facts-entities';
    svc.addTurn(id, 'Hallo', 'Hallo!');
    const hist = svc.getHistory(id);
    const result = svc.resolve('OK', hist, id);
    assert.ok(Array.isArray(result.facts.entities), 'entities muss ein Array sein');
  });

  it('Entscheidungssatz im Assistenten → facts.decisions enthält Eintrag', () => {
    const svc = freshService();
    const id = 'conv-facts-decision';
    svc.addTurn(
      id,
      'Docker oder VM?',
      'Ich empfehle Docker für diese Architektur. Es ist effizienter.',
    );
    const hist = svc.getHistory(id);
    const result = svc.resolve('OK', hist, id);

    assert.ok(result.facts.decisions.length > 0,
      `decisions muss mindestens einen Eintrag haben, ist: ${JSON.stringify(result.facts.decisions)}`);
  });

  it('facts werden ohne conversationId aus der History berechnet', () => {
    const svc = freshService();
    const hist: ConversationMessage[] = [
      { role: 'user', content: 'Analysiere die Systemarchitektur für dieses Jahr' },
      { role: 'assistant', content: 'Ich analysiere das.' },
    ];
    // No conversationId — falls back to extractFactsFromHistory
    const result = svc.resolve('Details', hist);

    assert.ok(result.facts.topic !== undefined, 'topic muss aus History extrahiert werden');
    assert.equal(result.facts.timeContext, 'dieses Jahr');
  });
});

// ── Test H: RetrievedContext ──────────────────────────────────────────────────

describe('Test H — RetrievedContext', () => {
  it('kurze History (kein Archiv) → retrievedContext ist leer', () => {
    const svc = freshService();
    const id = 'conv-retrieved-short';
    svc.addTurn(id, 'Was ist Docker?', 'Docker ist eine Container-Plattform.');
    const hist = svc.getHistory(id);
    const result = svc.resolve('Details', hist, id);
    assert.deepEqual(result.retrievedContext, [], 'retrievedContext muss leer sein bei kurzem Archiv');
  });

  it('Archiv enthält passende Nachricht → retrievedContext ist nicht leer', () => {
    const svc = freshService();
    const id = 'conv-retrieved-match';
    // Build 5 turns so first turns end up in archive
    svc.addTurn(id, 'Analysiere die Systemarchitektur unserer Plattform', 'Die Systemarchitektur besteht aus Microservices.');
    svc.addTurn(id, 'Wie funktioniert das Deployment?', 'Das Deployment läuft via Docker.');
    svc.addTurn(id, 'Welche Sicherheitsmaßnahmen gibt es?', 'Wir verwenden OAuth2 und TLS.');
    svc.addTurn(id, 'Was sind die Performance-Anforderungen?', 'Die Latenz muss unter 200ms bleiben.');
    svc.addTurn(id, 'Welche Datenbank wird verwendet?', 'PostgreSQL ist die primäre Datenbank.');

    const hist = svc.getHistory(id);
    // "Systemarchitektur" appears in the archived portion
    const result = svc.resolve('Analysiere Systemarchitektur erneut', hist, id);

    assert.ok(result.retrievedContext.length > 0,
      'retrievedContext muss bei passendem Archiveintrag gefüllt sein');
  });

  it('Archiv enthält nur irrelevante Nachrichten → retrievedContext ist leer', () => {
    const svc = freshService();
    const id = 'conv-retrieved-miss';
    svc.addTurn(id, 'Wie ist das Wetter heute?', 'Ich habe keinen Wetterzugriff.');
    svc.addTurn(id, 'Was ist 2 + 2?', 'Das Ergebnis ist 4.');
    svc.addTurn(id, 'Nenn mir einen Witz', 'Warum weinen Elefanten? Weil der Rüssel läuft!');
    svc.addTurn(id, 'Danke schön', 'Gerne!');
    svc.addTurn(id, 'Tschüss', 'Auf Wiedersehen!');

    const hist = svc.getHistory(id);
    // Query about Softwarearchitektur should not match weather/math/jokes
    const result = svc.resolve('Analysiere Softwarearchitektur', hist, id);

    assert.deepEqual(result.retrievedContext, [],
      'retrievedContext muss leer sein wenn kein Archiveintrag passt');
  });
});

// ── Test I: ContextPackage Shape ──────────────────────────────────────────────

describe('Test I — ContextPackage Shape', () => {
  it('resolve() gibt immer alle Pflichtfelder zurück', () => {
    const svc = freshService();
    const result = svc.resolve('Was ist Docker?', []);

    assert.ok('isFollowUp' in result, 'isFollowUp fehlt');
    assert.ok('resolvedIntent' in result, 'resolvedIntent fehlt');
    assert.ok('topicMessage' in result, 'topicMessage fehlt');
    assert.ok('recentTurns' in result, 'recentTurns fehlt');
    assert.ok('facts' in result, 'facts fehlt');
    assert.ok('retrievedContext' in result, 'retrievedContext fehlt');
  });

  it('facts hat immer entities[] und decisions[]', () => {
    const svc = freshService();
    const result = svc.resolve('Hallo', []);

    assert.ok(Array.isArray(result.facts.entities), 'facts.entities muss ein Array sein');
    assert.ok(Array.isArray(result.facts.decisions), 'facts.decisions muss ein Array sein');
  });

  it('recentTurns ist immer ein Array', () => {
    const svc = freshService();
    const result = svc.resolve('Test', []);
    assert.ok(Array.isArray(result.recentTurns));
  });

  it('retrievedContext ist immer ein Array', () => {
    const svc = freshService();
    const result = svc.resolve('Test', []);
    assert.ok(Array.isArray(result.retrievedContext));
  });

  it('isFollowUp false → resolvedIntent === originale Nachricht', () => {
    const svc = freshService();
    const result = svc.resolve('Was ist eine Microservice-Architektur?', []);
    assert.equal(result.isFollowUp, false);
    assert.equal(result.resolvedIntent, 'Was ist eine Microservice-Architektur?');
  });

  it('summary ist undefined wenn kein Archiv existiert', () => {
    const svc = freshService();
    const result = svc.resolve('Hallo', []);
    assert.equal(result.summary, undefined);
  });
});
