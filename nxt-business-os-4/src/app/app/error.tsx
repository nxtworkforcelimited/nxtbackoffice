'use client';
export default function WorkspaceError({reset}:{reset:()=>void}){return <main className="panel people-form"><h1>Your workspace could not load</h1><p>This may be a temporary connection or service problem. Your account has not been changed.</p><button className="primary" onClick={reset}>Try again</button><p><a href="/login">Return to sign in</a></p></main>;}
