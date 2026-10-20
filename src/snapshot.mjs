import { validateData } from './model.mjs';

export function validateSnapshot(value, projectUrl) {
  if (!value || value.schemaVersion !== 1 || value.projectUrl !== projectUrl
    || !Number.isSafeInteger(value.version) || value.version < 0
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Invalid squad snapshot');
  }
  validateData(value.data);
  return value;
}
