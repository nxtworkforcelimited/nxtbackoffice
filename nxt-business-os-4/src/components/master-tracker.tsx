'use client';
import {useEffect, useState} from 'react';
import {ArrowUpRight, ShieldCheck, FolderKanban, ListChecks, Users, FileText} from 'lucide-react';

type Catalog = {url: string; libraryUrl: string; projects: {name: string; description: string; url: string}[]};
const sections = [
  ['Tasks', 'Review owners, priorities, internal and client deadlines, acceptance checks and dependencies.'],
  ['Approvals', 'Follow approval gates, review status and outstanding decisions across delivery.'],
  ['Risks', 'Review delivery risks, responsible owners and actions that need attention.'],
  ['Files & Handovers', 'Find exact file versions, recipient responses and handover history.'],
  ['Team workload', 'Review open work, overdue tasks and blockers by owner.'],
  ['Brief & delivery plan', 'Read deliverables, responsibilities, milestones and acceptance requirements.'],
  ['Business and Audience', 'Understand each business, its offers and intended customers.'],
  ['Sitemaps and Journeys', 'Review proposed pages, customer journeys and required content.'],
] as const;

export default function MasterTracker({workspace, demo = false}: {workspace: string; demo?: boolean}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState(0);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setCatalog(null); setError('');
    fetch('/api/master-tracker?workspace=' + encodeURIComponent(workspace), {cache: 'no-store', signal: controller.signal})
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Master Tracker could not load.');
        if (!controller.signal.aborted) setCatalog(body);
      }).catch(reason => {if (!controller.signal.aborted) setError(reason.message || 'Master Tracker could not load.');});
    return () => controller.abort();
  }, [workspace, demo, attempt]);

  if (!demo && error) return <section className="panel"><p role="alert">{error}</p><button className="secondary" onClick={() => setAttempt(a => a + 1)}>Try again</button></section>;
  if (!demo && !catalog) return <section className="panel" role="status">Checking internal access…</section>;
  return <div className="master-tracker">
    <section className="master-intro">
      <div><span className="master-private"><ShieldCheck size={15}/>Internal only</span><h2>Master Tracker</h2><p>One place to reach your team’s delivery trackers, decisions and handovers.</p></div>
      {catalog ? <a className="primary" href={catalog.url} target="_blank" rel="noopener noreferrer">Open live Master Tracker <ArrowUpRight size={17}/></a> : <span className="badge">Demo · no live records</span>}
    </section>
    <div className="master-note"><ShieldCheck size={18}/><p>Live records open in the private tracker in a new tab. Sign in with your invited ChatGPT account. Updates stay in the original team tracker; Business OS does not store a duplicate.</p></div>
    <section aria-labelledby="master-projects-title"><div className="panel-head"><h3 id="master-projects-title">Team trackers</h3><span className="badge">{demo ? 'Sample workspace' : '3 connected destinations'}</span></div><div className="master-project-grid">
      {(catalog?.projects || [{name: 'Sample project', description: 'Example delivery workspace', url: ''}]).map((project, index) => <article className={'master-project master-accent-' + index} key={project.name}><FolderKanban size={23}/><h3>{project.name}</h3><p>{project.description}</p>{project.url ? <a href={project.url} target="_blank" rel="noopener noreferrer">Open team tracker <ArrowUpRight size={15}/></a> : <span className="footnote">Live links appear after staff sign-in.</span>}</article>)}
    </div></section>
    <section className="master-delivery" aria-labelledby="master-delivery-title"><div className="panel-head"><div><h3 id="master-delivery-title">Delivery overview</h3><p>Choose what to review in the live Master Tracker.</p></div><ListChecks size={23}/></div>
      <div className="master-sections" aria-label="Tracker sections">{sections.map(([name], index) => <button key={name} aria-pressed={section === index} className={section === index ? 'active' : ''} onClick={() => setSection(index)}>{name}</button>)}</div>
      <div className="master-section-detail"><div><span className="eyebrow">IN THE LIVE TRACKER</span><h3>{sections[section][0]}</h3><p>{sections[section][1]}</p><small>Open the Master Tracker, then select “{sections[section][0]}” in Delivery overview.</small></div>{catalog && <a className="secondary" href={catalog.url} target="_blank" rel="noopener noreferrer">Open Master Tracker <ArrowUpRight size={15}/></a>}</div>
    </section>
    <div className="master-resource-grid"><section className="panel"><FileText size={22}/><h3>Document library</h3><p>Open the existing private document library for shared working references.</p>{catalog && <a href={catalog.libraryUrl} target="_blank" rel="noopener noreferrer">Open document library <ArrowUpRight size={15}/></a>}</section><section className="panel"><Users size={22}/><h3>Access for the team</h3><p>Available to signed-in Business OS owners, administrators and staff. Client accounts cannot open this submodule. Tracker invitations are managed separately.</p></section></div>
  </div>;
}
