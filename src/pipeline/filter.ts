import fs from 'node:fs/promises'
import sharp from 'sharp'

export async function detectFormat(filePath: string): Promise<string | null> {
	try {
		const handle = await fs.open(filePath, 'r')
		const buffer = Buffer.alloc(12)
		try {
			await handle.read(buffer, 0, 12, 0)
		} finally {
			await handle.close()
		}

		// JPEG
		if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg'
		// PNG
		if (
			buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
			buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
		) return 'png'
		// WebP (RIFF....WEBP)
		if (
			buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
			buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
		) return 'webp'
		// GIF
		if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif'

		// AVIF fallback via Sharp (ISOBMFF container makes magic bytes unreliable)
		try {
			const metadata = await sharp(filePath).metadata()
			if (metadata.format === 'heif') return 'avif'
		} catch {
			return null
		}

		return null
	} catch {
		return null
	}
}

export async function isImage(filePath: string): Promise<boolean> {
	return (await detectFormat(filePath)) !== null
}
