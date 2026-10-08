export interface RouterHandlers {
  importConfig(payload: { rawText: string }): Promise<unknown>;
  activate(): Promise<unknown>;
  deactivate(): Promise<unknown>;
  status(): Promise<unknown>;
  fetchProton(payload: { username: string; password: string }): Promise<unknown>;
  installVencord(): Promise<unknown>;
  vencordStatus(): Promise<unknown>;
  checkUpdate(): Promise<unknown>;
  downloadUpdate(payload: { url: string }): Promise<unknown>;
}

export function makeRouter(h: RouterHandlers) {
  return async (channel: string, payload: any): Promise<unknown> => {
    switch (channel) {
      case 'config:import':       return h.importConfig(payload);
      case 'tunnel:activate':     return h.activate();
      case 'tunnel:deactivate':   return h.deactivate();
      case 'tunnel:status':       return h.status();
      case 'proton:fetch':        return h.fetchProton(payload);
      case 'vencord:install':     return h.installVencord();
      case 'vencord:status':      return h.vencordStatus();
      case 'app:checkUpdate':     return h.checkUpdate();
      case 'app:downloadUpdate':  return h.downloadUpdate(payload);
      default: throw new Error(`Canal IPC desconhecido: ${channel}`);
    }
  };
}
