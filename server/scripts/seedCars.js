// Fills the database with sample cars so search and pagination have data to work on.
//   npm run seed:cars           -> adds cars only if the collection is empty
//   npm run seed:cars -- --reset -> deletes ALL cars first, then adds them
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Car } from '../src/models/Car.js';
import { User } from '../src/models/User.js';

const cars = [
  ['Maruti Suzuki', 'Swift', 2023, 'hatchback', 5, 'petrol', 'manual', 'Ahmedabad', 1400, ['Bluetooth', 'Rear camera']],
  ['Hyundai', 'i20', 2022, 'hatchback', 5, 'petrol', 'automatic', 'Ahmedabad', 1800, ['Sunroof', 'Apple CarPlay']],
  ['Tata', 'Tiago EV', 2024, 'hatchback', 5, 'electric', 'automatic', 'Gandhinagar', 1900, ['Fast charging', 'Connected car']],
  ['Maruti Suzuki', 'Dzire', 2023, 'sedan', 5, 'cng', 'manual', 'Gandhinagar', 1500, ['CNG + petrol', 'Bluetooth']],
  ['Honda', 'City', 2023, 'sedan', 5, 'petrol', 'automatic', 'Ahmedabad', 2600, ['Sunroof', 'Lane watch']],
  ['Hyundai', 'Verna', 2024, 'sedan', 5, 'diesel', 'manual', 'Mumbai', 2700, ['Ventilated seats']],
  ['Hyundai', 'Creta', 2023, 'suv', 5, 'diesel', 'automatic', 'Ahmedabad', 3200, ['Panoramic sunroof', 'ADAS']],
  ['Tata', 'Nexon EV', 2024, 'suv', 5, 'electric', 'automatic', 'Mumbai', 3000, ['Fast charging', '360 camera']],
  ['Mahindra', 'Thar', 2023, 'suv', 4, 'diesel', 'manual', 'Gandhinagar', 3500, ['4x4', 'Convertible top']],
  ['Mahindra', 'XUV700', 2024, 'suv', 7, 'diesel', 'automatic', 'Bengaluru', 4500, ['ADAS', '7 seats']],
  ['Toyota', 'Innova Crysta', 2023, 'muv', 7, 'diesel', 'manual', 'Ahmedabad', 4200, ['Captain seats', 'Rear AC']],
  ['Maruti Suzuki', 'Ertiga', 2022, 'muv', 7, 'cng', 'manual', 'Bengaluru', 2400, ['7 seats', 'CNG + petrol']],
  ['Kia', 'Carens', 2024, 'muv', 6, 'petrol', 'automatic', 'Mumbai', 3300, ['Captain seats', 'Sunroof']],
  ['Toyota', 'Fortuner', 2023, 'suv', 7, 'diesel', 'automatic', 'Bengaluru', 7500, ['4x4', 'Leather seats']],
  ['Mercedes-Benz', 'C-Class', 2023, 'luxury', 5, 'petrol', 'automatic', 'Mumbai', 12000, ['Chauffeur option', 'Ambient lighting']],
  ['BMW', '3 Series', 2024, 'luxury', 5, 'diesel', 'automatic', 'Ahmedabad', 11000, ['Leather seats', 'Harman Kardon audio']],
].map(([brand, model, year, type, seats, fuel, transmission, city, pricePerDay, features]) => ({
  brand, model, year, type, seats, fuel, transmission, city, pricePerDay, features, images: [],
}));

const reset = process.argv.includes('--reset');

try {
  await mongoose.connect(env.mongoUri);

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin found. Run `npm run create-admin` first.');

  if (reset) {
    const { deletedCount } = await Car.deleteMany({});
    console.log(`Deleted ${deletedCount} existing cars`);
  } else if ((await Car.countDocuments()) > 0) {
    console.log('Cars already exist. Use `npm run seed:cars -- --reset` to replace them.');
    process.exit(0);
  }

  await Car.insertMany(cars.map((c) => ({ ...c, addedBy: admin._id })));
  console.log(`Inserted ${cars.length} sample cars`);
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
