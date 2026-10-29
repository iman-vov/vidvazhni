import { describe, expect, it } from 'vitest';
import { plural, t } from '../../src/ui/i18n';

describe('plural', () => {
  it('picks uk one/few/many', () => {
    const forms = ['спрацювання', 'спрацювання', 'спрацювань'];
    expect([1, 2, 4, 5, 11, 21, 22, 25].map((n) => plural(n, ['a', 'b', 'c'], 'uk'))).toEqual(['a', 'b', 'b', 'c', 'c', 'a', 'b', 'c']);
    expect(plural(2, forms, 'uk')).toBe('спрацювання');
  });

  it('picks de/en one/other', () => {
    expect([1, 2, 5].map((n) => plural(n, ['card', 'cards'], 'en'))).toEqual(['card', 'cards', 'cards']);
    expect(plural(1, ['Karte', 'Karten'], 'de')).toBe('Karte');
  });

  it('a counter in a text agrees with its number', () => {
    expect(t('duration.uses', { uses: 2 })).toBe('(2 спрацювання)');
    expect(t('duration.uses', { uses: 5 })).toBe('(5 спрацювань)');
    expect(t('game.select.hint', { n: 1 })).toMatch(/^Обери ще 1 карту\./);
  });
});
