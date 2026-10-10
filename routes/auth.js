import { Router } from 'express';
import { User } from '../models/User.js';
import { protect, restrictTo, signToken } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/errors.js';
import { isId } from '../utils/clean.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/login  { email, password } -> { token, user:{id,name,email,role} }
router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw new HttpError(400, 'Please provide email and password');
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    const ok = await (user ? user.checkPassword(password) : User.hashPassword(password).then(() => false));
    if (!user || !ok) throw new HttpError(401, 'Invalid credentials');
    if (user.accountStatus !== 'active') throw new HttpError(403, 'Account is suspended');

    res.json({
      success: true,
      token: signToken(user),
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  })
);

// POST /api/auth/register  (doctor/admin only)
// App sends: { name, email, phone, password, role:"patient", doctorId }; reads `userId` from the reply.
router.post(
  '/register',
  protect,
  restrictTo('doctor', 'admin'),
  ah(async (req, res) => {
    const { name, email, phone = '', password, role, doctorId } = req.body || {};
    if (![name, email, password].every((v) => typeof v === 'string' && v.trim())) {
      throw new HttpError(400, 'Name, email and password are required');
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) throw new HttpError(400, 'Please enter a valid email address');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');

    // Doctors can only create patients assigned to themselves. Admins may also create doctors.
    let newRole = 'patient';
    let assignedDoctor = req.user._id;
    if (req.user.role === 'admin') {
      newRole = role === 'doctor' ? 'doctor' : 'patient';
      if (newRole === 'patient') {
        if (!isId(doctorId) || !(await User.exists({ _id: doctorId, role: 'doctor' }))) {
          throw new HttpError(400, 'A valid doctorId is required');
        }
        assignedDoctor = doctorId;
      } else {
        assignedDoctor = null;
      }
    }

    if (await User.exists({ email: cleanEmail })) {
      throw new HttpError(409, 'A user with this email already exists');
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: String(phone).trim(),
      passwordHash: await User.hashPassword(password),
      role: newRole,
      assignedDoctor,
    });

    // The app's doctor flow requires HTTP 200 here (not 201).
    res.status(200).json({
      success: true,
      message: 'User registered successfully',
      userId: String(user._id),
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  })
);

router.get('/me', protect, (req, res) => {
  const u = req.user;
  res.json({ success: true, user: { id: String(u._id), name: u.name, email: u.email, role: u.role } });
});

export default router;
