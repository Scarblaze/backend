import { Router } from 'express';
import { ImageAsset } from '../models/ImageAsset.js';
import { MaterialSession } from '../models/MaterialSession.js';
import { DialysisSession } from '../models/DialysisSession.js';
import { User } from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { canAccessPatient } from '../services/access.js';
import { verifyImageLink } from '../services/imageLinks.js';
import { HttpError, ah } from '../utils/errors.js';

const router = Router();

// GET /api/images/:token — photos stored in MongoDB. Two ways in:
//   1. ?exp=…&sig=… — a signed, expiring link as returned inside API responses. No login needed,
//      so the Flutter app's Image.network(url) works. Invalid or expired signatures are refused
//      outright (they do NOT fall back to anything else).
//   2. No query string — requires `Authorization: Bearer <token>` and the same patient/hospital
//      access check as the rest of the API (used by the web portal).
function authorizeImageRequest(req, res, next) {
  const { exp, sig } = req.query;
  if (exp === undefined && sig === undefined) return protect(req, res, next);
  if (!verifyImageLink(req.params.token, exp, sig)) {
    return next(new HttpError(403, 'Image link is invalid or has expired. Reload the page to get a fresh link.'));
  }
  req.viaSignedLink = true;
  next();
}

router.get(
  '/:token',
  authorizeImageRequest,
  ah(async (req, res) => {
    const img = await ImageAsset.findOne({ token: req.params.token, storage: 'db' }).select('+data contentType patient ownerType ownerId');
    if (!img?.data) return res.status(404).json({ success: false, message: 'Image not found' });

    if (!req.viaSignedLink) {
      let hospitalId = null;
      if (img.ownerType === 'material') hospitalId = (await MaterialSession.findById(img.ownerId).select('hospital').lean())?.hospital || null;
      if (img.ownerType === 'dialysis') hospitalId = (await DialysisSession.findById(img.ownerId).select('hospital').lean())?.hospital || null;
      const patient = await User.findById(img.patient).select('_id assignedDoctor role');
      if (!patient) return res.status(404).json({ success: false, message: 'Image patient not found' });
      await canAccessPatient(req.user, patient, hospitalId);
    }

    res.set({
      'Content-Type': img.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(img.data);
  })
);

export default router;
