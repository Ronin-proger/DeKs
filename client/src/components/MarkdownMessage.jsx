import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { normalizeAiMath } from '../utils/normalizeAiMath';
import './MarkdownMessage.css';

export default function MarkdownMessage({ text, className = '' }) {
  const content = useMemo(() => normalizeAiMath(text), [text]);
  if (!content) return null;

  return (
    <div className={`markdown-message ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}