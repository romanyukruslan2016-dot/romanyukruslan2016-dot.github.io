import { describe, expect, it } from 'vitest';
import { generateMerchantSignature } from './signature';

describe('generateMerchantSignature', () => {
  it('is deterministic for the same inputs', async () => {
    const a = await generateMerchantSignature('WFP-abc', 415, 'UAH');
    const b = await generateMerchantSignature('WFP-abc', 415, 'UAH');
    expect(a).toBe(b);
  });

  it('changes completely when the amount changes by a single kopiyka', async () => {
    const original = await generateMerchantSignature('WFP-abc', 415, 'UAH');
    const tampered = await generateMerchantSignature('WFP-abc', 415.01, 'UAH');

    expect(tampered).not.toBe(original);
    // Avalanche property of SHA-256: a 1-kopiyka change must not leave a
    // recognizable shared prefix, i.e. this isn't a partial/incremental diff.
    expect(tampered.slice(0, 8)).not.toBe(original.slice(0, 8));
  });
});
