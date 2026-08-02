import { OAUTH_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, APIKEY_PROVIDERS } from '@/shared/constants/providers';

// Recreate the order logic from ModelSelectModal
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

test('opencode free provider comes before any free-tier provider', () => {
  const opencodeIdx = PROVIDER_ORDER.indexOf('opencode');
  expect(opencodeIdx).toBeGreaterThan(-1);
  for (const ftKey of Object.keys(FREE_TIER_PROVIDERS)) {
    const ftIdx = PROVIDER_ORDER.indexOf(ftKey);
    expect(ftIdx).toBeGreaterThan(-1);
    expect(opencodeIdx).toBeLessThan(ftIdx);
  }
});