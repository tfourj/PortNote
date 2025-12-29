
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

Clone this repo and simply run this compose.yml:
```yml
services:
  migrate:
    build:
      context: .
    command: ["npx", "prisma", "migrate", "deploy"]
    environment:
      DATABASE_URL: "file:/data/portnote.db"
    volumes:
      - portnote_data:/data

  web:
    build:
      context: .
    command: ["npm", "start"]
    depends_on:
      migrate:
        condition: service_completed_successfully
    ports:
      - "3000:3000"
    environment:
      JWT_SECRET: RANDOM_SECRET # Replace with a secure random string
      USER_SECRET: RANDOM_SECRET # Replace with a secure random string
      LOGIN_USERNAME: username # Replace with a username
      LOGIN_PASSWORD: mypassword # Replace with a custom password
      DATABASE_URL: "file:/data/portnote.db"
    volumes:
      - portnote_data:/data

  agent:
    build:
      context: ./agent
    user: "0:0"
    depends_on:
      migrate:
        condition: service_completed_successfully
    environment:
      DATABASE_URL: "file:/data/portnote.db"
    volumes:
      - portnote_data:/data

volumes:
  portnote_data:

```

## Tech Stack & Credits

The application is build with:
- Next.js & Typescript
- Tailwindcss with [daisyui](https://daisyui.com/)
- SQLite with [Prisma ORM](https://www.prisma.io/)
- Icons by [Lucide](https://lucide.dev/)
- and a lot of love ❤️

## License

Licensed under the [MIT License](https://github.com/crocofied/PortNote/blob/main/LICENSE).
