// One-time script to create the first admin.
// Why a script? The public /register route always creates normal users,
// so nobody can make themselves admin from the website.
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
  process.exit(1);
}

await mongoose.connect(env.mongoUri);

const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
if (existing) {
  existing.role = 'admin';
  await existing.save();
  console.log(`${ADMIN_EMAIL} already existed and is now an admin`);
} else {
  await User.create({
    name: ADMIN_NAME || 'Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
  console.log(`Admin created: ${ADMIN_EMAIL}`);
}

await mongoose.disconnect();
