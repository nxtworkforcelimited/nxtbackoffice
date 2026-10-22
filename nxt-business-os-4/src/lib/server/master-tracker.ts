type TrackerContext = {user: {id: string}; workspace?: {id: string; role: string}} | null;

// Catalog only. Live records and documents remain in their existing private trackers.
const catalog = {
  url: 'https://nxt-managing-director-master-tracker.hello153826.chatgpt.site',
  libraryUrl: 'https://nxt-managing-director-master-tracker.hello153826.chatgpt.site/library',
  projects: [
    {name: 'Kavi.R', description: 'Brand evolution and delivery', url: 'https://kavir-team-tracker.hello153826.chatgpt.site'},
    {name: 'Digital Safety Nest', description: 'Cyber safety and launch delivery', url: 'https://nxt-workforce-team-tracker.hello153826.chatgpt.site'},
    {name: 'Pack Easy', description: 'Delivery tasks, approvals and handovers', url: 'https://packeasy-team-tracker.hello153826.chatgpt.site'},
  ],
};
export async function masterTrackerResponse(workspace: string | null, getContext: (workspace: string) => Promise<TrackerContext>) {
  const headers = {'Cache-Control': 'private, no-store', Vary: 'Cookie'};
  if (!workspace) return Response.json({error: 'Choose a workspace.'}, {status: 400, headers});
  const ctx = await getContext(workspace);
  if (!ctx?.user) return Response.json({error: 'Sign in to continue.'}, {status: 401, headers});
  if (!ctx.workspace || ctx.workspace.id !== workspace || !['owner', 'admin', 'staff'].includes(ctx.workspace.role)) {
    return Response.json({error: 'Internal staff access required.'}, {status: 403, headers});
  }
  return Response.json(catalog, {headers});
}
