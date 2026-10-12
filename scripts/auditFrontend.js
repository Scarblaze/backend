import fs from 'node:fs';
import path from 'node:path';

const frontend = path.resolve(process.cwd(), '..', 'frontend', 'src');
const required = [
  'main.tsx',
  'app/App.tsx',
  'pages/PlatformAdminDashboard.tsx',
  'pages/HospitalAdminDashboard.tsx',
  'pages/DashboardPage.tsx',
  'pages/PatientProfilePage.tsx',
  'components/NotificationBell.tsx',
  'components/HospitalOperationsPage.tsx',
  'components/HospitalSettingsPage.tsx',
  'components/StaffInviteModal.tsx',
  'services/apiClient.ts',
  'services/permissions.ts',
];
const missing = required.filter((file) => !fs.existsSync(path.join(frontend, file)));
if (missing.length) throw new Error(`Missing frontend files: ${missing.join(', ')}`);
const app = fs.readFileSync(path.join(frontend, 'app/App.tsx'), 'utf8');
const permissions = fs.readFileSync(path.join(frontend, 'services/permissions.ts'), 'utf8');
const notification = fs.readFileSync(path.join(frontend, 'components/NotificationBell.tsx'), 'utf8');
if (!app.includes('platform_admin') || !app.includes('hospital_admin')) throw new Error('Role dashboard routing is incomplete');
if (!permissions.includes('editBaseline') || !permissions.includes("['doctor', 'admin']")) throw new Error('Baseline edit permission is not aligned');
if (!notification.includes('readNotification') || !notification.includes('notification-badge')) throw new Error('Notification center is incomplete');
console.log(JSON.stringify({ success: true, checkedFiles: required.length, activeEntry: 'main.tsx', roleRouting: true, notificationCenter: true }));
