const htmlTagPattern = /<[^>]+>/g;
const controlCharsPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(content: string): string {
  return content
    .replace(controlCharsPattern, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(htmlTagPattern, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function removeBoilerplate(content: string): string {
  const lines = content.split('\n');
  return lines
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (!normalized) return true;
      return ![
        'unsubscribe',
        'view in browser',
        'sent from my iphone',
        'confidentiality notice',
        'diese e-mail kann vertrauliche informationen enthalten',
      ].some((marker) => normalized.includes(marker));
    })
    .join('\n')
    .trim();
}

export function normalizeForHash(content: string): string {
  return cleanText(content).toLowerCase().replace(/\s+/g, ' ').trim();
}
