import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

// Cloudinary is optional at startup: if the keys are missing, the rest of the
// API still works and only the image routes answer "503 not configured".
export const cloudinaryEnabled = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true, // always return https:// links
  });
} else {
  console.warn('Cloudinary keys not set: image upload is disabled');
}

export { cloudinary };
