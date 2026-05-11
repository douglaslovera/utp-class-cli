import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptText(label: string): Promise<string> {
  const readline = createInterface({ input, output });

  try {
    return (await readline.question(label)).trim();
  } finally {
    readline.close();
  }
}

export async function promptPassword(label: string): Promise<string> {
  if (!input.isTTY) {
    return promptText(label);
  }

  return new Promise((resolve) => {
    const stdin = input;
    const stdout = output;
    let password = "";

    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          process.kill(process.pid, "SIGINT");
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(password);
          return;
        }

        if (char === "\u007f") {
          password = password.slice(0, -1);
          continue;
        }

        password += char;
      }
    };

    stdin.on("data", onData);
  });
}

