import { applyInputConstraint } from '../inputConstraints';

describe('applyInputConstraint', () => {
  describe('numeric', () => {
    it('keeps digits and strips letters and symbols', () => {
      expect(applyInputConstraint('30 tablets!', 'numeric')).toBe('30');
    });

    it('normalizes Eastern Arabic digits to ASCII', () => {
      expect(applyInputConstraint('۳۰', 'numeric')).toBe('30');
      expect(applyInputConstraint('٣٠', 'numeric')).toBe('30');
    });
  });

  describe('alpha', () => {
    it('strips digits but keeps letters and spaces', () => {
      expect(applyInputConstraint('Dr. Ahmed 3rd', 'alpha')).toBe('Dr. Ahmed rd');
    });

    it('keeps letters from any script', () => {
      expect(applyInputConstraint('احمد', 'alpha')).toBe('احمد');
    });
  });

  describe('time', () => {
    it('keeps digits and colons only', () => {
      expect(applyInputConstraint('08:30am', 'time')).toBe('08:30');
    });
  });

  describe('date', () => {
    it('keeps digits and date separators', () => {
      expect(applyInputConstraint('1950-05-1x5', 'date')).toBe('1950-05-15');
    });
  });

  describe('phone', () => {
    it('keeps digits and phone punctuation', () => {
      expect(applyInputConstraint('+92 300 1234567', 'phone')).toBe('+92 300 1234567');
    });

    it('strips letters', () => {
      expect(applyInputConstraint('call 0300', 'phone')).toBe(' 0300');
    });
  });
});
