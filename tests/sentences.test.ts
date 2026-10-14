import { describe, expect, it } from 'vitest';
import { sentencesOf } from '../src/ai/sentences';

describe('sentencesOf', () => {
  it('splits a text at the end of a sentence: a full stop, a question mark or an exclamation mark before a capital or a digit', () => {
    expect(sentencesOf('Birinci cümle. İkinci cümle! Üçüncü cümle? 4 Eylül geldi.')).toEqual([
      'Birinci cümle.',
      'İkinci cümle!',
      'Üçüncü cümle?',
      '4 Eylül geldi.',
    ]);
    expect(sentencesOf('Tek cümle; noktalı virgülle, virgülle: hâlâ tek.')).toEqual([
      'Tek cümle; noktalı virgülle, virgülle: hâlâ tek.',
    ]);
  });

  it('is nothing for nothing, and one sentence for one', () => {
    expect(sentencesOf('')).toEqual([]);
    expect(sentencesOf('   \n ')).toEqual([]);
    expect(sentencesOf('Sadece bir cümle')).toEqual(['Sadece bir cümle']);
  });

  it('does not split after a lone capital, a Roman numeral or a number of one or two digits ("I. Süleyman", "6. Ordu")', () => {
    expect(sentencesOf("I. Süleyman 1520'de tahta çıktı. 6. Ordu teslim oldu. II. Lajos öldü.")).toEqual([
      "I. Süleyman 1520'de tahta çıktı.",
      '6. Ordu teslim oldu.',
      'II. Lajos öldü.',
    ]);
    // (a number of four digits is a year: the sentence ends there)
    expect(sentencesOf('Olay 1939. Sonra savaş başladı.')).toEqual(['Olay 1939.', 'Sonra savaş başladı.']);
  });

  it('keeps a reference to an event whole: its words are never the end of a sentence, and it can begin one', () => {
    expect(
      sentencesOf(
        "[St. Petersburg Kuşatması](olay:leningrad-kusatmasi-1941) sürdü. [Dr. Smith'in raporu](olay:x-1) çıktı.",
      ),
    ).toEqual([
      '[St. Petersburg Kuşatması](olay:leningrad-kusatmasi-1941) sürdü.',
      "[Dr. Smith'in raporu](olay:x-1) çıktı.",
    ]);
    expect(sentencesOf('Ordu [Moskova önünde!](olay:moskova-1941) durdu.')).toEqual([
      'Ordu [Moskova önünde!](olay:moskova-1941) durdu.',
    ]);
  });

  it('ends a sentence after a closing quote or bracket, and after an ellipsis', () => {
    expect(sentencesOf('Dedi ki: “Geliyorum.” Sonra gitti. (Bu bir not.) Devam etti… Yeniden başladı.')).toEqual([
      'Dedi ki: “Geliyorum.”',
      'Sonra gitti.',
      '(Bu bir not.)',
      'Devam etti…',
      'Yeniden başladı.',
    ]);
  });

  it('puts the spaces and line breaks of the text in order', () => {
    expect(sentencesOf('Bir.\n\n  İki.   Üç.')).toEqual(['Bir.', 'İki.', 'Üç.']);
  });
});
