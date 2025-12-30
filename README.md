
![Logo](https://i.ibb.co/cS7SV1Sk/Kopie-von-Cash-Mate.png)


# PortNote

Forked from [PortNote by crocofied](https://github.com/crocofied/PortNote)

> [!NOTE]
> This repository is a personal fork of the original PortNote with AI assisted development for my own use-case changes.

Key changes in this fork:
- SQLite backend (Prisma) instead of PostgreSQL
- Real-time port scan progress with cancel support
- Updated agent scanning behavior and UI flow
- Fixed React2Shell(CVE-2025-55182) vulnerability

Stop juggling spreadsheets and guessing which service uses which port — PortNote gives you a clear, organized view of your entire port landscape. Add your servers and VMs via a sleek web interface, assign and document port usage across all systems, and avoid conflicts before they happen.


## Screenshots
Login Page:
![Login Page](/screenshots/login.png)

Dashboard:
![Dashboard](/screenshots/dashboard.png)

Create:
![Create](/screenshots/create.png)

Random Port Generator
![Portgen](/screenshots/portgen.png)

## Deployment

create compose.yml:
```yml
services:
  web:
    image: ghcr.io/tfourj/portnote:latest
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: "file:/data/portnote.db"
    volumes:
      - ./portnote_data:/data
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s

  agent:
    image: ghcr.io/tfourj/portnote-agent:latest
    user: "0:0"
    depends_on:
      web:
        condition: service_healthy
    env_file:
      - .env
    environment:
      DATABASE_URL: "file:/data/portnote.db"
    volumes:
      - ./portnote_data:/data
```
If you use watchtower for automatic updates please see example for [compose](compose-watchtower.yml)

## Tech Stack & Credits

The application is build with:
- Next.js & Typescript
- Tailwindcss with [daisyui](https://daisyui.com/)
- SQLite with [Prisma ORM](https://www.prisma.io/)
- Icons by [Lucide](https://lucide.dev/)
- and a lot of love ❤️

## License

Licensed under the [MIT License](https://github.com/crocofied/PortNote/blob/main/LICENSE).
