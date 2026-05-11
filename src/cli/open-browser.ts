import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openBrowser(url: string): void {
  const currentPlatform = platform();

  if (currentPlatform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (currentPlatform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

