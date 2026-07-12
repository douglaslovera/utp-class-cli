# Sessions in This Project

This project has two basic ways to have a UTP session in the CLI.

## 1. Local CLI session

This is the session used by the `utp` CLI itself.

- Create it with `utp login`
- Check it with `utp session`
- Refresh it with `utp refresh`
- Remove it with `utp logout`

The CLI saves this session to a local `session.json` file. By default that is under:

- macOS/Linux: `~/.config/utp-class-cli/session.json`
- Windows: `%APPDATA%/utp-class-cli/session.json`

You can also override the config directory with `UTP_CLASS_CLI_CONFIG_DIR`.

`utp login` asks for the UTP user and a hidden password, then completes the login in a headless browser. To log in interactively with a visible browser instead, use:

```sh
utp login --browser
```

Advanced login modes (`capture`, `localhost`, and `headless`) remain available through `--mode`, but they all end in the same kind of saved local CLI session.

Headless login needs a Chromium-based browser. On a server without Chrome or Edge, install Playwright's Chromium build from the project directory:

```sh
pnpm exec playwright install chromium
```

On Linux, if Chromium reports missing system libraries and you have administrator access, install them together with the browser:

```sh
pnpm exec playwright install --with-deps chromium
```

You can also point the CLI to an existing Chromium executable:

```sh
UTP_BROWSER_PATH=/usr/bin/chromium utp login
```

## 2. Copy an existing session from another machine

If you already logged in on another machine, you can copy the saved `session.json` file instead of running `utp login` again.

```sh
ssh server 'mkdir -p ~/.config/utp-class-cli && chmod 700 ~/.config/utp-class-cli'
scp ~/.config/utp-class-cli/session.json server:~/.config/utp-class-cli/session.json
ssh server 'chmod 600 ~/.config/utp-class-cli/session.json'
```

After copying it, run `utp session` on the target machine to confirm the CLI sees the session.

If you still need to set the UTP user id for API commands, use:

```sh
utp config user-id <userId>
```
