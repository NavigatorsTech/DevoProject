db = db.getSiblingDB('qtapp');

// The app looks up this exact plan name for new-user assignment and as the
// fallback for the "today's passage" route. An empty passages map is fine —
// lookups miss and the server falls back to "Proverbs <day-of-month>".
db.plans.insertOne({
  creatorEmail: 'local@dev.test',
  planName: '--- Default Nav Plan ---',
  description: 'Local dev default plan',
  passages: {},
});
