import { useState } from 'react';
import { sendChatMessage } from './api.js';

// Matches the API's 20-message / 24,000-character history budget.
function recentHistory(messages) {
  const history = [];
  let length = 0;
  for (const item of messages.slice(-20).reverse()) {
    if (length + item.content.length > 24000 || item.content.length > 8000) break;
    history.unshift({ role: item.role, content: item.content });
    length += item.content.length;
  }
  return history;
}

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [useRetrieval, setUseRetrieval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    const message = prompt.trim();
    setBusy(true);
    setError('');
    try {
      const data = await sendChatMessage({ message, history: recentHistory(messages), useRetrieval });
      setMessages((items) => [...items, { role: 'user', content: message }, { role: 'assistant', content: data.reply, sources: data.sources }]);
      setPrompt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow accent">CHATBOT</p><h2>Ask. Explore. Follow up.</h2>
      <div className="chat-toolbar">
        <label className="toggle"><input type="checkbox" checked={useRetrieval} onChange={(event) => setUseRetrieval(event.target.checked)} disabled={busy} /> Use knowledge base</label>
        <button type="button" className="secondary" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); }}>New chat</button>
      </div>
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
        {!messages.length && <p className="chat-empty">Start a conversation. Turn on the knowledge base to ask about documents your team has added.</p>}
        {messages.map((item, index) => <article className={`chat-message ${item.role}`} key={index}>
          <p className="eyebrow">{item.role === 'user' ? 'YOU' : 'ASSISTANT'}</p><p>{item.content}</p>
          {!!item.sources?.length && <details><summary>Reference excerpts ({item.sources.length})</summary>{item.sources.map((source) => <div key={source.id}><p><strong>[{source.citation}] {source.title || source.source}</strong></p><p>{source.excerpt}</p></div>)}</details>}
        </article>)}
        {busy && <p role="status">Thinking…</p>}
      </div>
      <form onSubmit={submit}>
        <label htmlFor="prompt">Your message</label>
        <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask a question…" maxLength={8000} rows={3} required disabled={busy} />
        <div className="form-footer"><small>{prompt.length.toLocaleString()} / 8,000</small><button disabled={busy || !prompt.trim()}>{busy ? 'Thinking…' : 'Send message ↗'}</button></div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
