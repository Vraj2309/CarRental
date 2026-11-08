// Proves double booking is impossible: fires many booking requests for the
// SAME car and SAME dates at the SAME moment. Exactly one must succeed.
//
// Usage (server must be running):
//   npm run race-test -- <user token> <car id> [startDate] [endDate]
// Dates default to 60 -> 62 days from today.

const [token, carId, startArg, endArg] = process.argv.slice(2);
const API = process.env.API_URL || 'http://localhost:5000';
const ATTEMPTS = 10;

if (!token || !carId) {
  console.error('Usage: npm run race-test -- <token> <carId> [YYYY-MM-DD] [YYYY-MM-DD]');
  process.exit(1);
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const startDate = startArg || day(60);
const endDate = endArg || day(62);

console.log(`Sending ${ATTEMPTS} simultaneous bookings for ${startDate} -> ${endDate}...\n`);

const send = () =>
  fetch(`${API}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ carId, startDate, endDate }),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));

// Promise.all starts every request before any of them finishes.
const results = await Promise.all(Array.from({ length: ATTEMPTS }, send));

const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
console.log('Status codes:', counts);

const created = results.filter((r) => r.status === 201).length;
if (created === 1) console.log('\nPASS: exactly one booking was created, the rest got 409.');
else if (created === 0) {
  console.log('\nNo booking created. Are these dates already booked? Try other dates.');
  if (counts[429]) console.log('(429 = this user has 3 unpaid holds. Wait 15 minutes or cancel them.)');
}
else console.log(`\nFAIL: ${created} bookings were created for the same dates!`);

const other = results.find((r) => ![201, 409].includes(r.status));
if (other) console.log('Unexpected response:', other.status, other.body);
