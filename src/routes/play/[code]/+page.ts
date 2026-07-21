import type { PageLoad } from './$types';

// Client-only: this page opens a WebSocket and boots Three.js, neither of which
// should run during SSR.
export const ssr = false;

export const load: PageLoad = ({ params, url }) => {
  return {
    code: params.code.toUpperCase(),
    name: url.searchParams.get('name') ?? 'Delver',
    seed: url.searchParams.get('seed') ?? undefined,
    classId: url.searchParams.get('class') ?? undefined,
  };
};
