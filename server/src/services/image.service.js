import { cloudinary, cloudinaryEnabled } from '../config/cloudinary.js';
import { Car } from '../models/Car.js';
import { ApiError } from '../utils/ApiError.js';
import { MAX_IMAGES_PER_CAR } from '../middleware/upload.js';

function assertEnabled() {
  if (!cloudinaryEnabled) throw new ApiError(503, 'Image upload is not configured on this server');
}

// Upload one file buffer to Cloudinary. upload_stream takes the bytes
// directly from memory; we wrap its callback in a Promise so we can await it.
function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'car-rental/cars',
        resource_type: 'image',
        // Resize huge phone photos (4000px+) on upload: saves storage and
        // makes pages load faster. "limit" never enlarges small images.
        transformation: [{ width: 1600, height: 1200, crop: 'limit' }],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function destroyMany(publicIds) {
  // Best-effort cleanup: one failed delete should not hide the original error.
  await Promise.allSettled(publicIds.map((id) => cloudinary.uploader.destroy(id)));
}

export async function addCarImages(carId, files) {
  assertEnabled();
  if (!files?.length) throw new ApiError(400, 'Attach at least one image in the "images" field');

  const car = await Car.findById(carId).select('images');
  if (!car) throw new ApiError(404, 'Car not found');
  if (car.images.length + files.length > MAX_IMAGES_PER_CAR) {
    throw new ApiError(
      400,
      `A car can have at most ${MAX_IMAGES_PER_CAR} images (it has ${car.images.length})`
    );
  }

  // Upload all files in parallel.
  const results = await Promise.allSettled(files.map((f) => uploadBuffer(f.buffer)));
  const uploaded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);

  // All or nothing: if any upload failed, remove the ones that succeeded,
  // so Cloudinary is never left with orphan files no car points to.
  if (uploaded.length !== files.length) {
    await destroyMany(uploaded.map((u) => u.public_id));
    throw new ApiError(502, 'Image upload failed, please try again');
  }

  const newImages = uploaded.map((u) => ({ url: u.secure_url, publicId: u.public_id }));

  // Save with a condition, in ONE atomic database operation:
  // "push these images, but only if the total will still be <= 8".
  // The check above alone is not enough: two uploads at the same moment could
  // both pass it and together exceed the limit (a race condition).
  const updated = await Car.findOneAndUpdate(
    {
      _id: carId,
      $expr: { $lte: [{ $add: [{ $size: '$images' }, newImages.length] }, MAX_IMAGES_PER_CAR] },
    },
    { $push: { images: { $each: newImages } } },
    { new: true }
  );

  if (!updated) {
    await destroyMany(newImages.map((i) => i.publicId));
    throw new ApiError(409, 'Image limit reached by another upload, please refresh and retry');
  }
  return updated;
}

export async function removeCarImage(carId, imageId) {
  assertEnabled();
  const car = await Car.findById(carId).select('images');
  if (!car) throw new ApiError(404, 'Car not found');

  const image = car.images.id(imageId); // find the sub-document by its _id
  if (!image) throw new ApiError(404, 'Image not found on this car');

  // Remove the link from MongoDB first, then the file from Cloudinary.
  // If Cloudinary fails, we only waste a little storage; the reverse order
  // could leave a car showing a broken image.
  const updated = await Car.findByIdAndUpdate(
    carId,
    { $pull: { images: { _id: imageId } } },
    { new: true }
  );
  if (image.publicId) await destroyMany([image.publicId]);
  return updated;
}
