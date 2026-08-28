# Tamil fonts for Print Corner PDF (Gotenberg / LibreOffice)

Drop your licensed font files here before building the Docker image, for example:

- `ATM35.ttf` (or whatever file name your ATM 35 install uses)

Then on the VM:

```bash
cd ~/print-corner-gotenberg
docker build -t print-corner-gotenberg:local .
```

Set in `.env`:

```
GOTENBERG_IMAGE=print-corner-gotenberg:local
```

Restart: `docker compose up -d`

**Word template:** File → Options → Save → check **Embed fonts in the file** (use full embed if Tamil glyphs are missing).
