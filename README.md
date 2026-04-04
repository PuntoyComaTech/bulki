# @puntoycoma/bulki

Ultra-fast CLI image optimizer. Compress, resize, and convert images in bulk.

Built on [Sharp](https://sharp.pixelplumbing.com/) (libvips). Only 2 production dependencies.

## Installation

```bash
npm install -g @puntoycoma/bulki
```

> Migrating from `gab-images-optimizer`? The `gio` command still works as an alias.

## Usage

```bash
bulki compress <path> [options]
```

### Options

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--quality <n>` | `-q` | Output quality (1-100) | `70` |
| `--format <fmt>` | `-f` | Convert to format: `jpeg`, `png`, `webp`, `gif`, `avif` | original |
| `--resize <width>` | `-r` | Max width in pixels | original |
| `--destination <path>` | `-d` | Output base directory | `.` |
| `--output-folder <name>` | `-o` | Output folder name | `bulki-output` |
| `--concurrency <n>` | | Parallel file limit (1-32) | auto |
| `--exclude <patterns...>` | | Glob patterns to skip | none |
| `--dry-run` | | Preview without writing files | `false` |
| `--verbose` | | Show per-file details | `false` |

## Examples

Compress all images in current directory:

```bash
bulki compress .
```

Compress a folder with quality 80 and convert to WebP:

```bash
bulki compress ./photos -q 80 -f webp
```

Compress a single image with resize:

```bash
bulki compress ./photo.png -r 1920 -q 85
```

Preview what would be processed:

```bash
bulki compress ./photos --dry-run
```

Compress with custom output location:

```bash
bulki compress ./photos -d ./output -o optimized
```

Exclude a directory:

```bash
bulki compress ./assets --exclude thumbnails
```

## Output

Optimized images are saved to `<destination>/bulki-output/` preserving the original folder structure.

```
photos/
  vacation/
    beach.jpg
    sunset.png

bulki-output/
  vacation/
    beach.jpg
    sunset.png
```

## Supported formats

| Format | Compress | Convert to | Convert from |
|--------|----------|------------|--------------|
| JPEG | yes | yes | yes |
| PNG | yes | yes | yes |
| WebP | yes | yes | yes |
| GIF | yes | yes | yes |
| AVIF | yes | yes | yes |

## Backward compatibility

The `gio` command from the original `gab-images-optimizer` package continues to work:

```bash
gio compress ./photos -q 80
```

## Requirements

- Node.js >= 24

## License

MIT
