export const normalizePhoneNumber = (phoneNumber: string): string => {
  const value = phoneNumber.trim();

  if (value.startsWith('+')) {
    return value;
  }

  const nationalNumber = value.startsWith('0') ? value.slice(1) : value;

  return `+90${nationalNumber}`;
};
