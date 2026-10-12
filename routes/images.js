import { Router } from 'express';
import { ImageAsset } from '../models/ImageAsset.js';
import { MaterialSession } from '../models/MaterialSession.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { User } from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { canAccessPatient } from '../services/access.js';
import { ah } from '../utils/errors.js';

const router = Router();

// GET /api/images/:token — photos stored in MongoDB. The token is a random 192-bit value,
// so the URL works in Image.network() without auth headers but can't be guessed.
router.get(
  '/:token',
  protect,
  ah(async (req, res) => {
    const img = await ImageAsset.findOne({ token: req.params.token, storage: 'db' }).select('+data contentType patient ownerType ownerId');
    if (!img?.data) return res.status(404).json({ success: false, message: 'Image not found' });
    let hospitalId = null;
    if (img.ownerType === 'material') hospitalId = (await MaterialSession.findById(img.ownerId).select('hospital').lean())?.hospital || null;
    if (img.ownerType === 'dialysis') hospitalId = (await DialysisSession.findById(img.ownerId).select('hospital').lean())?.hospital || null;
    const patient = await User.findById(img.patient).select('_id assignedDoctor role');
    if (!patient) return res.status(404).json({ success: false, message: 'Image patient not found' });
    await canAccessPatient(req.user, patient, hospitalId);
    res.set({
      'Content-Type': img.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(img.data);
  })
);

export default router;
