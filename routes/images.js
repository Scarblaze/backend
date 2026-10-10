import { Router } from 'express';
import { ImageAsset } from '../models/ImageAsset.js';
import { ah } from '../utils/errors.js';

const router = Router();

// GET /api/images/:token — photos stored in MongoDB. The token is a random 192-bit value,
// so the URL works in Image.network() without auth headers but can't be guessed.
router.get(
  '/:token',
  ah(async (req, res) => {
    const img = await ImageAsset.findOne({ token: req.params.token, storage: 'db' }).select('+data contentType');
    if (!img?.data) return res.status(404).json({ success: false, message: 'Image not found' });
    res.set({
      'Content-Type': img.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(img.data);
  })
);

export default router;
