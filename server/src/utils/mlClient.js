import { env } from '../config/env.js';

// Calls the Python ML service. NEVER throws: on any problem (service down,
// slow, bad answer) it returns null and the caller uses a fallback.
// A recommendation box or a price tweak must never break booking a car.
export async function callMl(path, body) {
  try {
    const res = await fetch(`${env.ml.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ml.key && { 'X-Internal-Key': env.ml.key }),
      },
      body: JSON.stringify(body),
      // Give up after 2 s: a slow ML service must not make the whole site slow.
      signal: AbortSignal.timeout(env.ml.timeoutMs),
    });
    if (!res.ok) {
      console.warn(`ML service ${path} answered ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`ML service ${path} unavailable: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
    return null;
  }
}
