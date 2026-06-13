/**
 * Currency utilities for CediSmart.
 *
 * All financial amounts in the app MUST be formatted through formatGHS.
 * Never use toLocaleString() or toFixed() directly in components to ensure
 * consistency and proper decimal handling.
 */

/**
 * Formats a number or string as Ghana Cedis (GHS).
 * Example: 2300 -> "GHS 2,300.00"
 */
export const formatGHS = (amount: number | string): string => {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(value)) {
    return 'GHS 0.00';
  }

  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    currencyDisplay: 'code',
  })
    .format(value)
    .replace('GHS', 'GHS ');
};

/**
 * Parses a currency input string into a number.
 * Removes "GHS", commas, and whitespace.
 */
export const parseCurrencyInput = (input: string): number => {
  const cleanValue = input.replace(/[GHS,\s]/g, '');
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
};
