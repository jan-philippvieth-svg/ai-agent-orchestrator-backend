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
    assert.ok(result.contextForPrompt.length > 0, 'contextForPrompt darf nicht leer sein');
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
    assert.ok(result.contextForPrompt.length >= 2, 'contextForPrompt muss min. 2 Nachrichten enthalten');

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
