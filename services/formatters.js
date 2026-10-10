import { DialysisSession } from '../models/DialysisSession.js';
import { ImageAsset } from '../models/ImageAsset.js';
import { str, toInt } from '../utils/clean.js';

export function baseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

export const formatImage = (img, base) => ({
  id: String(img._id),
  imageUrl: img.storage === 'db' ? `${base}/api/images/${img.token}` : img.url,
  uploadedAt: img.uploadedAt,
  publicId: img.publicId || '',
});

const DONE = new Set(['completed', 'verified']);

function formatDialysis(s, images, base) {
  return {
    sessionId: String(s._id),
    sequence: s.sequence,
    status: s.status,
    startedAt: s.startedAt || null,
    completedAt: s.completedAt || null,
    verifiedAt: s.verifiedAt || null,
    verificationNotes: s.verificationNotes || null,
    verifiedBy: s.verifiedByName || null,
    parameters: { voluntary: s.voluntary || null, readings: s.readings || null },
    images: images.map((i) => formatImage(i, base)),
  };
}

// Builds the shape the Flutter `MaterialSession` model parses, for any number of kits at once.
export async function buildMaterialPayloads(materials, base) {
  if (!materials.length) return [];
  const ids = materials.map((m) => m._id);
  const sessions = await DialysisSession.find({ materialSession: { $in: ids } }).sort({ sequence: 1 }).lean();
  const owners = [...ids, ...sessions.map((s) => s._id)];
  const images = await ImageAsset.find({ ownerId: { $in: owners } })
    .select('-data')
    .sort({ uploadedAt: 1 })
    .lean();

  const imagesByOwner = new Map();
  for (const img of images) {
    const k = String(img.ownerId);
    if (!imagesByOwner.has(k)) imagesByOwner.set(k, []);
    imagesByOwner.get(k).push(img);
  }

  return materials.map((m) => {
    const mine = sessions.filter((s) => String(s.materialSession) === String(m._id));
    const done = mine.filter((s) => DONE.has(s.status)).length;
    const p = m.pdMaterials || {};
    return {
      materialSessionId: String(m._id),
      createdAt: m.createdAt,
      status: m.status,
      acknowledgedAt: m.acknowledgedAt || null,
      notes: m.notes || '',
      materials: {
        pdMaterials: {
          transferSet: p.transferSet || 0,
          capd: p.capd || {},
          apd: p.apd || {},
          icodextrin2L: p.icodextrin2L || 0,
          minicap: p.minicap || 0,
          others: p.others || null,
        },
        sessionsCount: m.sessionsCount,
      },
      totalSessionsAllowed: m.sessionsCount,
      completedSessions: done,
      remainingSessions: Math.max(0, m.sessionsCount - done),
      materialImages: (imagesByOwner.get(String(m._id)) || []).map((i) => formatImage(i, base)),
      dialysisSessions: mine.map((s) => formatDialysis(s, imagesByOwner.get(String(s._id)) || [], base)),
    };
  });
}

// ---- Medical profile / baseline -------------------------------------------------

export function formatProfile(doc, patientId) {
  const p = doc || {};
  const ec = p.emergencyContact || {};
  return {
    patientId: String(patientId),
    gender: str(p.gender),
    age: toInt(p.age, 0),
    bloodGroup: str(p.bloodGroup),
    dialysisType: str(p.dialysisType),
    height: str(p.height),
    weight: str(p.weight),
    primaryDiagnosis: str(p.primaryDiagnosis),
    nativeKidneyDisease: str(p.nativeKidneyDisease),
    allergies: (p.allergies || []).map(String),
    comorbidities: (p.comorbidities || []).map(String),
    address: str(p.address),
    contactNumber: str(p.contactNumber),
    crNumber: str(p.crNumber),
    educationLevel: str(p.educationLevel),
    incomeLevel: str(p.incomeLevel),
    emergencyContact: { name: str(ec.name), phone: str(ec.phone), relation: str(ec.relation) },
  };
}

export function formatBaseline(doc) {
  if (!doc) return null;
  const { _id, __v, patient, updatedBy, createdAt, updatedAt, ...rest } = doc;
  return { ...rest, createdAt, updatedAt };
}
