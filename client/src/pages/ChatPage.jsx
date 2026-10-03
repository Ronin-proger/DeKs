import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, BookOpen, Send, User, Sparkles } from 'lucide-react';
import { apiFetch, parseApiResponse } from '../config/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import MarkdownMessage from '../components/MarkdownMessage';
import './ChatPage.css';

function ChatPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const messagesRef = useRef(null);
  const toast = useToast();
  const { t } = useLanguage();

  const suggestions = useMemo(() => [
    t('chat_suggest_1'),
    t('chat_suggest_2'),
    t('chat_suggest_3'),
  ], [t]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatHistory, loading]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message.trim() || loading) return;

    setLoading(true);
    const userMessage = message.trim();
    setMessage('');
    setChatHistory((prev) => [...prev, { type: 'user', text: userMessage }]);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await parseApiResponse(response);
      setChatHistory((prev) => [...prev, { type: 'ai', text: data.response }]);
    } catch (error) {
      const errText = error.message || t('chat_error_response');
      setChatHistory((prev) => [...prev, { type: 'error', text: errText }]);
      toast.error(errText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-bg" />

      <div className="chat-window">
        <header className="chat-status-bar">
          <Link to="/dashboard" className="chat-back-btn">
            <ArrowLeft size={16} /> {t('chat_back')}
          </Link>
          <div className="chat-title">
            <Bot size={18} />
            <span>{t('dash_ai_title')}</span>
          </div>
          <div className="chat-badges">
            <span className="chat-badge">Ollama</span>
            <span className="chat-status-pill">{t('dash_ai_online')}</span>
          </div>
          <Link to="/obsidian" className="chat-rag-link">
            <BookOpen size={14} /> {t('chat_rag_link')}
          </Link>
        </header>

        <div className="chat-suggestions">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              className="chat-suggestion"
              onClick={() => setMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="chat-body">
          <div className="chat-messages" ref={messagesRef}>
            {chatHistory.length === 0 && !loading ? (
              <div className="chat-empty">
                <div className="chat-empty-avatar">
                  <Bot size={36} />
                </div>
                <h2>{t('dash_ai_title')}</h2>
                <p>{t('dash_ai_desc')}</p>
                <small>
                  <Sparkles size={12} /> {t('chat_empty_hint')}
                </small>
              </div>
            ) : (
              chatHistory.map((chat, index) => (
                <div
                  key={index}
                  className={`chat-msg ${chat.type === 'user' ? 'user' : chat.type === 'error' ? 'error' : 'assistant'}`}
                >
                  <span className="chat-msg-icon">
                    {chat.type === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </span>
                  <div className="chat-msg-body">
                    <span className="chat-msg-label">
                      {chat.type === 'user'
                        ? t('chat_label_you')
                        : chat.type === 'error'
                          ? t('chat_label_error')
                          : t('chat_label_ai')}
                    </span>
                    {chat.type === 'ai' ? (
                      <MarkdownMessage text={chat.text} className="chat-markdown" />
                    ) : (
                      <p>{chat.text}</p>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="chat-msg assistant">
                <span className="chat-msg-icon"><Bot size={16} /></span>
                <div className="chat-msg-body">
                  <span className="chat-msg-label">{t('chat_label_ai')}</span>
                  <div className="chat-typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="chat-composer">
            <input
              type="text"
              className="chat-composer-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('chat_placeholder')}
              disabled={loading}
            />
            <button type="submit" className="chat-send-btn" disabled={loading || !message.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
