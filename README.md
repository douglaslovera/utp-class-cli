# UTP Class CLI

A small command-line client for accessing UTP class information, notifications, pending activities, and Zoom meetings.

## Use cases

- Todos los días a las 8:00am ejecuta estos comandos para que me des un resumen de las notificaciones y actividades pendientes del día o la semana:

  ```sh
  utp notifications --seen false --json
  utp activities --json
  ```

- Todos los lunes y jueves a las 6:25pm hasta el 7 de diciembre, envíame el enlace de Zoom de:

  ```sh
  utp course zoom {id de clase} --latest
  ```

## Requirements

- [pnpm](https://pnpm.io/)
- A Chromium-based browser for the login flow

## Setup

Install dependencies:

```sh
pnpm install
```

Link the CLI globally so the `utp` command is available in your terminal:

```sh
pnpm setup
pnpm link --global
utp --help
```

If pnpm is already configured, `pnpm setup` can be skipped. Restart your terminal after setup if pnpm asks you to update your `PATH`.

Log in and let the CLI detect the user ID used by API commands:

```sh
utp login
utp session
```

The login normally detects and saves your UTP student code (código de alumno) from the identity provider. This is the identifier you use to access UTP+Class and other UTP platforms; it is not your password. Confirm that `utp session` shows a value under `User id`.

If the value is shown as `unknown`, find your student code in your UTP student or enrollment information, then save it manually:

```sh
utp config user-id <student-code>
utp session
```

This configuration is needed once per local session. Alternatively, pass `--user-id <student-code>` to an individual data command.

Use `utp login --browser` to open a visible browser during login. See [SESSIONS.md](SESSIONS.md) for session details and server setup.

## Common commands

```sh
utp session
utp notifications --seen false
utp notifications --json
utp activities --json
utp courses
utp courses --search "course name"
utp course zoom <course> --latest
```

Most data commands also accept `--user-id <id>` when the user ID is not stored in the local session.

## Development

Run the CLI directly from the repository:

```sh
pnpm run cli --help
```

Run checks and tests:

```sh
pnpm run check
pnpm test
```
