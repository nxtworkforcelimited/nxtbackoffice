"use client";
export default function ErrorPage({reset}:{reset:()=>void}) {return <main className="setup"><h1>We couldn’t load your workspace</h1><p>Check the Supabase configuration and migration, then try again. No sample data has replaced your records.</p><button onClick={reset}>Try again</button></main>;}
