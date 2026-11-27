// The only bridge between the page and the main process. Runs sandboxed, before the page, and
// exposes exactly two functions (see DesktopBridge in @pass1/shared). The page gets no Node.js
// and no general access to IPC: just these.

import { DESKTOP_BRIDGE_NAME, DESKTOP_CHANNELS, type DesktopApiRequest, type DesktopBridge } from "@pass1/shared";
import { contextBridge, ipcRenderer } from "electron";

const bridge: DesktopBridge = {
  request: (request: DesktopApiRequest) => ipcRenderer.invoke(DESKTOP_CHANNELS.apiRequest, request),
  onLockRequested(onLock) {
    const listener = () => onLock();
    ipcRenderer.on(DESKTOP_CHANNELS.lockRequested, listener);
    return () => ipcRenderer.removeListener(DESKTOP_CHANNELS.lockRequested, listener);
  },
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_NAME, bridge);
