/**
 * Utility to convert Khmer numerals and common Khmer numeral words to global Arabic numerals (0-9).
 * Example:
 * "កូដ ១៥ យក ២" -> "កូដ 15 យក 2"
 * "១៧=២" -> "17=2"
 */
export function convertKhmerNumeralsToGlobal(str: string): string {
  if (!str) return '';
  const khmerDigits: Record<string, string> = {
    '០': '0',
    '១': '1',
    '២': '2',
    '៣': '3',
    '៤': '4',
    '៥': '5',
    '៦': '6',
    '៧': '7',
    '៨': '8',
    '៩': '9'
  };

  return str.replace(/[០-៩]/g, match => khmerDigits[match] || match);
}

/**
 * Standardize comment text with numbers converted and clean spacing
 */
export function formatKhmerCommentForDisplay(str: string): string {
  if (!str) return '';
  return convertKhmerNumeralsToGlobal(str.trim());
}
