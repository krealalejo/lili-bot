import { describe, expect, it } from 'vitest';
import { decodeFields, decodeValue, encodeFields, encodeValue } from './firestore.ts';
import type { RotationDoc } from '../types.ts';

const roundTrip = (data: Record<string, unknown>): Record<string, unknown> =>
  decodeFields(encodeFields(data) as Record<string, Record<string, unknown>>);

describe('firestore value codec', () => {
  it('round-trips a whole rotation document unchanged', () => {
    const doc: RotationDoc = {
      immune: ['111', '222'],
      lastRoundAt: '2026-09-15T10:00:00.000Z',
      pool: {
        messageId: '999',
        hostId: '111',
        note: 'Ranked a las 22:00',
        closesAt: 1_789_000_000_000,
        participants: ['111', '222', '333'],
        closeSecret: 'abc123',
      },
    };

    expect(roundTrip(doc as unknown as Record<string, unknown>)).toEqual(doc);
  });

  it('round-trips a document with no open pool and no memory', () => {
    const doc: RotationDoc = { immune: [], lastRoundAt: null, pool: null };

    expect(roundTrip(doc as unknown as Record<string, unknown>)).toEqual(doc);
  });

  it('keeps large millisecond timestamps exact', () => {
    // Integers travel as strings precisely so this does not drift.
    const closesAt = 1_789_123_456_789;

    expect(decodeValue(encodeValue(closesAt) as Record<string, unknown>)).toBe(closesAt);
    expect(encodeValue(closesAt)).toEqual({ integerValue: '1789123456789' });
  });

  it('distinguishes integers from doubles', () => {
    expect(encodeValue(5)).toEqual({ integerValue: '5' });
    expect(encodeValue(5.5)).toEqual({ doubleValue: 5.5 });
  });

  it('treats undefined as null rather than dropping the field', () => {
    expect(roundTrip({ note: undefined })).toEqual({ note: null });
  });

  it('decodes an empty array that came back without a values key', () => {
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
    expect(decodeValue({ mapValue: {} })).toEqual({});
  });

  it('refuses values it cannot represent instead of writing something wrong', () => {
    expect(() => encodeValue(() => undefined)).toThrow(TypeError);
  });
});
