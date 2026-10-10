import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../utils/errors.js';

const cloudinaryEnabled = () =>
  Boolean(process.env.CLOUDINARY_URL) ||
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Identify the image from its first bytes; clients can't be trusted to send a content type.
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (/^(heic|heix|hevc|mif1|msf1|heim|heis)/.test(brand)) return 'image/heic';
  }
  return null;
}

// Returns the fields to merge into an ImageAsset document.
export async function storeImage(buffer) {
  const contentType = sniffImage(buffer);
  if (!contentType) throw new HttpError(400, 'File is not a supported image (jpg, png, webp, heic, gif)');

  if (cloudinaryEnabled()) {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'digital-dialysis', resource_type: 'image' }, (err, res) =>
          err ? reject(err) : resolve(res)
        )
        .end(buffer);
    });
    return { storage: 'cloudinary', url: result.secure_url, publicId: result.public_id, contentType };
  }

  return {
    storage: 'db',
    token: crypto.randomBytes(24).toString('hex'),
    publicId: '',
    data: buffer,
    contentType,
  };
}

export async function deleteStoredImage(asset) {
  if (asset.storage === 'cloudinary' && asset.publicId && cloudinaryEnabled()) {
    await cloudinary.uploader.destroy(asset.publicId).catch(() => {});
  }
}
