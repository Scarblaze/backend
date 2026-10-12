import { Router } from 'express';
import { Notification } from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

const router = Router(); router.use(protect);
router.get('/', ah(async (req, res) => { const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(); res.json({ success: true, unread: items.filter((item) => !item.readAt).length, notifications: items }); }));
router.patch('/:notificationId/read', ah(async (req, res) => { if (!isId(req.params.notificationId)) throw new HttpError(400, 'Invalid notificationId'); const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, user: req.user._id }, { readAt: new Date() }, { new: true }).lean(); if (!item) throw new HttpError(404, 'Notification not found'); res.json({ success: true, notification: item }); }));
export default router;
