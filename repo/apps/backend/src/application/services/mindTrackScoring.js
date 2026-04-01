export function phoneLast4(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-4);
}

export function scoreDuplicate(candidate, payload) {
  let score = 0;
  if (candidate.name.trim().toLowerCase() === payload.name.trim().toLowerCase()) {
    score += 0.5;
  }
  if (new Date(candidate.dob).toISOString().slice(0, 10) === payload.dob) {
    score += 0.3;
  }
  if (candidate.phoneLast4 === phoneLast4(payload.phone)) {
    score += 0.2;
  }
  return score;
}
