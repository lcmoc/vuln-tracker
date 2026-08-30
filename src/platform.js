import { spawn } from "node:child_process";

// Pick the argv for the current OS from a { darwin, win32, linux } map.
function forPlatform(map) {
  if (process.platform === "darwin") return map.darwin;
  if (process.platform === "win32") return map.win32;
  return map.linux;
}

export function openInBrowser(url) {
  const [command, args] = forPlatform({
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
    linux: ["xdg-open", [url]],
  });
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

export function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const [command, args] = forPlatform({
      darwin: ["pbcopy", []],
      win32: ["clip", []],
      linux: ["xclip", ["-selection", "clipboard"]],
    });

    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.stdin.write(text);
    child.stdin.end();
  });
}
