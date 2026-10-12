import { HospitalMembership } from '../models/HospitalMembership.js';
import { Notification } from '../models/Notification.js';

export async function notifyHospitalAdmins({ hospital, type, title, message, resourceType = '', resourceId = '' }) {
  const admins = await HospitalMembership.find({ hospital, role: 'hospital_admin', status: 'active' }).select('user').lean();
  if (!admins.length) return;
  await Notification.insertMany(admins.map(({ user }) => ({ user, hospital, type, title, message, resourceType, resourceId, actionUrl: resourceType && resourceId ? `/${resourceType.toLowerCase()}/${resourceId}` : '' })));
}
