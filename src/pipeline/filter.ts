import fs from 'node:fs/promises'
import sharp from 'sharp'

/** Detected as HEIC/HEIF (e.g. iPhone photos): libvips prebuilt binaries can't decode HEVC. */
export const UNSUPPORTED = 'unsupported'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const AVIF_BRANDS = new Set(['avif', 'avis'])
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

/**
 * Identify an image by its magic bytes, never by extension.
 * Returns 'jpeg' | 'png' | 'webp' | 'gif' | 'avif', UNSUPPORTED for HEIC/HEIF,
 * or null when the file is not an image.
 */
export async function detectFormat(filePath: string): Promise<string | null> {
	const buffer = Buffer.alloc(12)
	try {
		const handle = await fs.open(filePath, 'r')
		try {
			const { bytesRead } = await handle.read(buffer, 0, 12, 0)
			if (bytesRead < 4) return null
		} finally {
			await handle.close()
		}
	} catch {
		return null
	}

	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
	if (buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'png'
	if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP')
		return 'webp'
	if (buffer.toString('latin1', 0, 3) === 'GIF') return 'gif'

	// ISOBMFF container: [box size][ftyp][major brand]
	if (buffer.toString('latin1', 4, 8) === 'ftyp') {
		const brand = buffer.toString('latin1', 8, 12)
		if (AVIF_BRANDS.has(brand)) return 'avif'
		if (HEIF_BRANDS.has(brand)) {
			// `mif1` may wrap AV1 too — ask libvips which codec it really is
			try {
				const meta = await sharp(filePath).metadata()
				if (meta.format === 'heif' && meta.compression === 'av1') return 'avif'
			} catch {
				// header unreadable without the HEVC codec
			}
			return UNSUPPORTED
		}
	}

	return null
}

export async function isImage(filePath: string): Promise<boolean> {
	const fmt = await detectFormat(filePath)
	return fmt !== null && fmt !== UNSUPPORTED
}
