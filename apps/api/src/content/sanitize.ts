import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

/**
 * Walks Puck data in place and sanitizes every `text` string prop that looks
 * like HTML. Defense against stored XSS on the public site — render uses
 * dangerouslySetInnerHTML for richtext content.
 */
export function sanitizePuckData(puckData: unknown): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === 'string' && /<[a-z!/]/i.test(obj.text)) {
      obj.text = sanitizeHtml(obj.text, OPTIONS);
    }
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) walk(value);
    }
  };
  walk(puckData);
}
