// normalize ollama math quirks before markdown/katex render
const LATEX_HINT = /\\[a-zA-Z]+|[\^_=+\-*/]|\\frac|\\sqrt|\\sum|\\int|\\pi|\\alpha|\\beta|\\theta/;

function looksLikeLatex(value) {
  return LATEX_HINT.test(value);
}

export function normalizeAiMath(text) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`);
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `$${inner.trim()}$`);

  // [ S = \pi r^2 ] — common ollama format; skip markdown links [text](url)
  result = result.replace(/\[([^\]\n]+)\](?!\()/g, (match, inner) => {
    const trimmed = inner.trim();
    if (!looksLikeLatex(trimmed)) return match;
    const wrap = trimmed.length > 48 ? '$$' : '$';
    return `${wrap}${trimmed}${wrap}`;
  });

  return result;
}
