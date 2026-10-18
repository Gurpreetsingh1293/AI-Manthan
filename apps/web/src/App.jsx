import { useEffect, useState } from 'react';
import { api } from './lib/api.js';

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [database, setDatabase] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api('/health', { signal: controller.signal }).then(setHealth).catch((err) => {
      if (err.name !== 'AbortError') setHealthError('Backend unavailable. Start the Express server.');
    });
    return () => controller.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      const data = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ prompt }) });
      setAnswer(data.reply);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkDatabase() {
    setChecking(true);
    setDatabase('');
    try {
      await api('/health/database');
      setDatabase('Connected — Supabase query succeeded.');
    } catch (err) {
      setDatabase(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <main>
      <header><a className="brand" href="/">M<span>·</span></a><span className="eyebrow">AI MANTHAN / TEAM WORKSPACE</span></header>
      <section className="intro">
        <p className="eyebrow accent">READY TO BUILD</p>
        <h1>Your next idea<br />starts here.</h1>
        <p className="subtitle">A connected foundation for your team. Bring the problem, build the solution.</p>
      </section>
      <div className="status-grid">
        <Status label="01 / FRONTEND" title="React" detail="Running in your browser" ready />
        <Status label="02 / BACKEND" title="Express" detail={healthError || (health ? 'API online' : 'Connecting…')} ready={!!health} />
        <Status label="03 / DATABASE" title="Supabase" detail={health?.services.supabase ? 'Configured · check connection below' : 'Add your credentials'} ready={health?.services.supabase} />
        <Status label="04 / INTELLIGENCE" title="Groq" detail={health?.services.groq ? 'API key configured' : 'Add your API key'} ready={health?.services.groq} />
      </div>
      <div className="workspace">
        <section className="panel">
          <p className="eyebrow accent">AI PLAYGROUND</p><h2>Make your first API call.</h2>
          <form onSubmit={submit}>
            <label htmlFor="prompt">Your prompt</label>
            <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Explain an idea, brainstorm a feature, or ask a question…" maxLength={8000} rows={5} required />
            <div className="form-footer"><small>{prompt.length.toLocaleString()} / 8,000</small><button disabled={busy || !prompt.trim()}>{busy ? 'Thinking…' : 'Send to Groq ↗'}</button></div>
          </form>
          <div aria-live="polite" aria-busy={busy}>
            {error && <p className="error" role="alert">{error}</p>}
            {answer && <div className="answer"><p className="eyebrow">RESPONSE</p><p>{answer}</p></div>}
          </div>
        </section>
        <aside className="panel setup">
          <p className="eyebrow accent">CONNECTION CHECK</p><h2>Connect your database.</h2>
          <p>Add your Supabase credentials to the backend environment, then run the starter migration in Supabase’s SQL editor.</p>
          <button className="secondary" onClick={checkDatabase} disabled={checking}>{checking ? 'Checking…' : 'Test Supabase connection ↗'}</button>
          <p className="connection-result" role="status">{database}</p>
          <hr /><p className="eyebrow">TEAM OWNERSHIP</p>
          <ul><li>Frontend → <code>apps/web</code></li><li>Backend → <code>apps/api</code></li><li>AI → <code>apps/api/src/services/groq.js</code></li><li>Database → <code>supabase/migrations</code></li></ul>
        </aside>
      </div>
      <footer>AI Manthan 2.0 <span>React + Express + Supabase + Groq</span></footer>
    </main>
  );
}

function Status({ label, title, detail, ready }) {
  return <article className="status"><p className="eyebrow">{label}</p><h2><span className={`dot ${ready ? 'ready' : ''}`} />{title}</h2><p>{detail}</p></article>;
}
