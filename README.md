# @puntoycoma/bulki

Ultra-fast, free, open-source CLI image optimizer with interactive mode, AI editor integration, and automation tools.

Built on [Sharp](https://sharp.pixelplumbing.com/) (libvips). Compress, resize, and convert JPEG, PNG, WebP, GIF, and AVIF images in bulk.

## Why bulki?

- **Fast** — Powered by Sharp/libvips, 4-5x faster than ImageMagick
- **Interactive** — Run `bulki` with no arguments for a guided experience
- **AI-ready** — Built-in MCP server for Claude Code, Cursor, Windsurf, and Cline
- **Automated** — Git hooks, watch mode, and CI/CD integration
- **Lightweight** — Minimal dependencies, 15 KB package size
- **Free** — MIT licensed, no API keys, no accounts, runs 100% locally

## Installation

```bash
npm install -g @puntoycoma/bulki
```

## Quick start

### Interactive mode

Just run `bulki` with no arguments:

```bash
bulki
```

You get a guided menu with presets and custom options — no commands to memorize.

### CLI mode

```bash
# Compress all images in a directory
bulki compress ./photos

# Convert to WebP with quality 80
bulki compress ./photos -f webp -q 80

# Resize to max 1920px width
bulki compress ./photos -r 1920

# Compress a single file
bulki compress ./photo.png -q 85 -f avif
```

## Features

### Compress images

Optimize images with full control over format, quality, and dimensions.

```bash
bulki compress <path> [options]
```

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--quality <n>` | `-q` | Output quality (1-100) | `70` |
| `--format <fmt>` | `-f` | Convert to: `jpeg`, `png`, `webp`, `gif`, `avif` | original |
| `--resize <width>` | `-r` | Max width in pixels | original |
| `--destination <path>` | `-d` | Output base directory | `.` |
| `--output-folder <name>` | `-o` | Output folder name | `bulki-output` |
| `--concurrency <n>` | | Parallel operations (1-32) | auto |
| `--exclude <patterns...>` | | Directory names to skip | none |
| `--dry-run` | | Preview without writing files | `false` |
| `--verbose` | | Show per-file details | `false` |
| `--json` | | Machine-readable JSON output | `false` |
| `--max-size <size>` | | Fail if output exceeds limit | none |

#### Examples

```bash
# Optimize for web: WebP, quality 80, max 1920px
bulki compress ./assets -f webp -q 80 -r 1920

# Preview what would be processed
bulki compress ./uploads --dry-run

# CI/CD: fail if any image exceeds 200 KB
bulki compress ./public --max-size 200kb

# JSON output for scripts and automation
bulki compress ./images --json
```

#### JSON output

Use `--json` for machine-readable output:

```json
{
  "files": [
    {
      "input": "/path/to/photo.jpg",
      "output": "/path/to/bulki-output/photo.webp",
      "originalSize": 2400000,
      "newSize": 680000,
      "reduction": 72,
      "format": "webp",
      "duration": 45
    }
  ],
  "summary": {
    "totalFiles": 1,
    "totalOriginalSize": 2400000,
    "totalNewSize": 680000,
    "totalReduction": 72,
    "duration": 120,
    "errors": 0
  },
  "errors": []
}
```

#### Size budget

Prevent oversized images in your project:

```bash
# Fail if any optimized image exceeds 200 KB
bulki compress ./assets --max-size 200kb

# Combined with JSON for CI pipelines
bulki compress ./public --max-size 500kb --json
```

Exit code is `1` if any file exceeds the budget — perfect for CI checks.

### Pipe (stdin/stdout)

Process images through Unix pipes:

```bash
bulki pipe -f <format> [-q quality] [-r width]
```

#### Examples

```bash
# Download and optimize in one command
curl -s https://example.com/photo.jpg | bulki pipe -f webp -q 80 > photo.webp

# Convert format on the fly
cat input.png | bulki pipe -f avif -q 70 > output.avif

# Chain with other tools
cat photo.jpg | bulki pipe -f webp -r 800 | aws s3 cp - s3://bucket/photo.webp
```

#### Use cases

- **CI/CD pipelines** — optimize images during build without temp files
- **Webhooks** — receive image, optimize, forward in one stream
- **Scripts** — compose with curl, aws, gsutil, or any Unix tool

### Watch mode

Monitor a directory and auto-optimize new images:

```bash
bulki watch <directory> [options]
```

#### Examples

```bash
# Watch a folder and convert new images to WebP
bulki watch ./uploads -f webp -q 80

# Watch with resize
bulki watch ./photos -r 1920 -q 85 -d ./optimized
```

#### Use cases

- **Photographers** — drop photos from camera, get optimized versions automatically
- **Designers** — export from Figma/Sketch, images optimize on save
- **Local servers** — monitor an upload directory

### Git hook

Auto-optimize images on every commit:

```bash
# Install the pre-commit hook
bulki hook install

# Remove it
bulki hook uninstall
```

Once installed, every time you `git commit` an image file (JPEG, PNG, WebP, GIF, AVIF), bulki optimizes it automatically before the commit completes.

#### Use cases

- **Teams** — no one commits unoptimized images, ever
- **CI savings** — smaller images = faster builds and deploys
- **Repo health** — keep your repository lean without manual work

### MCP Server (AI editor integration)

bulki exposes an MCP (Model Context Protocol) server so AI coding assistants can optimize images directly.

```bash
bulki mcp
```

This starts a local MCP server (no API key, no internet required) that provides two tools:

| Tool | Description |
|------|-------------|
| `compress` | Optimize images in a file or directory |
| `detect` | Check if a file is an image and identify its format |

#### Setup with Claude Code

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bulki": {
      "command": "npx",
      "args": ["@puntoycoma/bulki", "mcp"]
    }
  }
}
```

Then in Claude Code, you can say:

> "Optimize all images in the project for web"

And Claude will call bulki directly.

#### Setup with Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "bulki": {
      "command": "npx",
      "args": ["@puntoycoma/bulki", "mcp"]
    }
  }
}
```

#### Use cases

- **Claude Code** — "compress all PNG files to WebP"
- **Cursor** — "optimize the images in /public"
- **Windsurf / Cline** — any MCP-compatible AI editor
- **Custom agents** — build your own tools with bulki as a backend

## Supported formats

| Format | Compress | Convert to | Convert from |
|--------|----------|------------|--------------|
| JPEG | yes | yes | yes |
| PNG | yes | yes | yes |
| WebP | yes | yes | yes |
| GIF | yes | yes | yes |
| AVIF | yes | yes | yes |

## Output structure

Optimized images are saved preserving the original folder structure:

```
photos/                    bulki-output/
  vacation/         ->       vacation/
    beach.jpg                  beach.jpg
    sunset.png                 sunset.png
  profile.png                profile.png
```

## Integration examples

### GitHub Actions

```yaml
- name: Optimize images
  run: npx @puntoycoma/bulki compress ./public -f webp -q 80 --max-size 500kb
```

### npm scripts

```json
{
  "scripts": {
    "optimize": "bulki compress ./src/assets -f webp -q 80",
    "optimize:check": "bulki compress ./public --max-size 200kb --dry-run"
  }
}
```

### Pre-commit (manual setup)

```bash
# In your project
bulki hook install
```

## Backward compatibility

The `gio` command from the original `gab-images-optimizer` package still works:

```bash
gio compress ./photos -q 80
```

## Requirements

- Node.js >= 24

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/PuntoyComaTech/bulki](https://github.com/PuntoyComaTech/bulki).
