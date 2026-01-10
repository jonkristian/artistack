# Artistack

A self-hosted link-in-bio page for musicians and bands.

## Features

- Profile with logo, photo, and bio
- Social media links
- Streaming links with embedded players (Spotify, YouTube, Bandcamp)
- Tour dates with venue autocomplete and calendar export
- Customizable colors and layout
- Media library with image cropping and automatic optimization
- Favicon generator with PWA support

## Tech Stack

- SvelteKit
- SQLite with Drizzle ORM
- Tailwind CSS
- Sharp for image processing
- Better Auth for authentication

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Copy the example environment file and configure:
   ```bash
   cp .env.example .env
   ```

3. Set up the database:
   ```bash
   npx drizzle-kit push
   ```

4. Start the dev server:
   ```bash
   bun run dev
   ```

## Environment Variables

See `.env.example` for all available options:

- `ORIGIN` - Your site URL (e.g., `https://example.com`)
- `BETTER_AUTH_SECRET` - Secret key for authentication

## License

Artistack is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

You are free to self-host, modify, and distribute Artistack. If you run a modified version as a network service, you must make your changes available under the same license.
