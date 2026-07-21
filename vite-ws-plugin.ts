import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { Server as HttpServer } from 'node:http';
import { attachGameWSS } from './src/lib/server/gameServer.ts';

// Mounts the authoritative game WebSocket server onto Vite's dev + preview
// HTTP servers. The bridge itself lives in src/lib/server/gameServer.ts (no
// `vite` import) so a standalone production server can reuse it. This plugin
// is dev/preview-only glue.
export function viteWSPlugin(): Plugin {
  return {
    name: 'delve-ws',
    configureServer(server: ViteDevServer) {
      if (server.httpServer) attachGameWSS(server.httpServer as HttpServer);
    },
    configurePreviewServer(server: PreviewServer) {
      if (server.httpServer) attachGameWSS(server.httpServer as HttpServer);
    },
  };
}
