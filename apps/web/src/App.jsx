import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import Chatbot from './features/chatbot/Chatbot.jsx';

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [database, setDatabase] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api('/health', { signal: controller.signal }).then(setHealth).catch((err) => {
      if (err.name !== 'AbortError') setHealthError('Backend unavailable. Start the Express server.');
    });
    return () => controller.abort();
  }, []);

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
        <Chatbot />
        <aside className="panel setup">
          <p className="eyebrow accent">CONNECTION CHECK</p><h2>Connect your database.</h2>
          <p>Add your Supabase credentials to the backend environment, then run the starter migration in Supabase’s SQL editor.</p>
          <button className="secondary" onClick={checkDatabase} disabled={checking}>{checking ? 'Checking…' : 'Test Supabase connection ↗'}</button>
          <p className="connection-result" role="status">{database}</p>
          <hr /><p className="eyebrow">TEAM OWNERSHIP</p>
          <ul><li>Frontend → <code>apps/web</code></li><li>Backend → <code>apps/api</code></li><li>AI → <code>apps/api/src/modules/chatbot</code></li><li>Database → <code>supabase/migrations</code></li></ul>
        </aside>
      </div>
      <footer>AI Manthan 2.0 <span>React + Express + Supabase + Groq</span></footer>
    </main>
  );
}

function Status({ label, title, detail, ready }) {
  return <article className="status"><p className="eyebrow">{label}</p><h2><span className={`dot ${ready ? 'ready' : ''}`} />{title}</h2><p>{detail}</p></article>;
}
