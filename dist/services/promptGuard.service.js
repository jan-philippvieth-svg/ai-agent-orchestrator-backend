const BLOCKED_MESSAGE = 'Prompt asks for hidden instructions, secrets, or policy bypass.';
const BLOCKED_REASON_CODE = 'potential_injection';
export class PromptGuardService {
    rules = [
        {
            category: 'instruction_hijacking',
            pattern: /\b(ignore|vergiss|ignoriere|disregard|override)\b.{0,80}\b(system|developer|previous|vorherige|instructions|anweisungen|regeln)\b/i,
            severity: 'block',
            warning: 'Detected attempt to override system or developer instructions.',
        },
        {
            category: 'hidden_prompt_exfiltration',
            pattern: /\b(system\s*prompt|developer\s*message|hidden\s*prompt|interne\s*anweisung|versteckte\s*anweisung|prompt\s*ausgeben|zeige.{0,30}prompt)\b/i,
            severity: 'block',
            warning: 'Detected attempt to reveal hidden prompts or internal instructions.',
        },
        {
            category: 'secret_exfiltration',
            pattern: /\b(api[-_ ]?key|secret|token|password|passwort|private\s*key|zugangsdaten|credentials)\b.{0,120}\b(show|print|reveal|ausgeben|anzeigen|leak|exfiltrate|extrahieren)\b/i,
            severity: 'block',
            warning: 'Detected attempt to reveal secrets or credentials.',
        },
        {
            category: 'jailbreak',
            pattern: /\b(jailbreak|dan mode|do anything now|bypass safety|disable guardrails|sicherheitsregeln umgehen)\b/i,
            severity: 'block',
            warning: 'Detected jailbreak or safety bypass wording.',
        },
        {
            category: 'prompt_injection_terms',
            pattern: /\b(prompt injection|instruction injection|ignore all safeguards|roleplay as unrestricted)\b/i,
            severity: 'warn',
            warning: 'Prompt contains prompt-injection terminology; answer should stay within policy.',
        },
    ];
    evaluate(message) {
        const sanitizedMessage = this.sanitize(message);
        const warnings = [];
        const categories = new Set();
        let blocked = false;
        for (const rule of this.rules) {
            if (!rule.pattern.test(sanitizedMessage))
                continue;
            warnings.push(rule.warning);
            categories.add(rule.category);
            if (rule.severity === 'block')
                blocked = true;
        }
        return {
            allowed: !blocked,
            sanitizedMessage,
            warnings,
            categories: [...categories],
            risk: blocked ? 'blocked' : warnings.length > 0 ? 'medium' : 'low',
            reasonCode: blocked ? BLOCKED_REASON_CODE : undefined,
            reason: blocked ? BLOCKED_MESSAGE : undefined,
        };
    }
    sanitize(message) {
        return message
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
