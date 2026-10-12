import { Router } from 'express';
import { Hospital } from '../models/Hospital.js';
import { HospitalMembership } from '../models/HospitalMembership.js';
import { User } from '../models/User.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { requireHospitalAccess } from '../middleware/hospitalAccess.js';
import { HttpError, ah } from '../utils/errors.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/hospitals/:hospitalId/doctors  { name, email, password, phone? }
// A hospital admin creates a doctor account directly (email + password) and
// attaches it to this hospital. The doctor can sign in immediately.
router.post(
  '/:hospitalId/doctors',
  protect,
  restrictTo('admin', 'platform_admin', 'hospital_admin'),
  requireHospitalAccess('hospital_admin'),
  ah(async (req, res) => {
    const { name, email, password, phone = '' } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Doctor name is required');
    if (name.trim().length > 120) throw new HttpError(400, 'Doctor name must be under 120 characters');
    if (typeof email !== 'string' || !email.trim()) throw new HttpError(400, 'Doctor email is required');
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) throw new HttpError(400, 'Please enter a valid email address');
    if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const hospital = await Hospital.findById(req.params.hospitalId).select('status').lean();
    if (!hospital) throw new HttpError(404, 'Hospital not found');
    if (hospital.status !== 'active') throw new HttpError(409, 'Doctors cannot be added to a suspended hospital');

    if (await User.exists({ email: cleanEmail })) throw new HttpError(409, 'A user with this email already exists');

    const doctor = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: String(phone).trim(),
      passwordHash: await User.hashPassword(password),
      role: 'doctor',
    });

    try {
      const membership = await HospitalMembership.create({
        hospital: req.params.hospitalId,
        user: doctor._id,
        role: 'doctor',
        status: 'active',
      });
      await AuditEvent.create({
        actor: req.user._id,
        hospital: req.params.hospitalId,
        action: 'hospital.doctor.created',
        resourceType: 'User',
        resourceId: String(doctor._id),
        metadata: { email: cleanEmail, membershipId: String(membership._id) },
      });
      res.status(201).json({
        success: true,
        doctor: { id: String(doctor._id), name: doctor.name, email: doctor.email, phone: doctor.phone, role: doctor.role },
        membership,
      });
    } catch (error) {
      // Do not leave a doctor account that belongs to no hospital.
      await HospitalMembership.deleteOne({ hospital: req.params.hospitalId, user: doctor._id });
      await User.deleteOne({ _id: doctor._id });
      throw error;
    }
  })
);

export default router;