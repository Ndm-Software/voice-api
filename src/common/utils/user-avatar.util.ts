export function getUserInitials(firstName: string, lastName: string): string {
  const firstInitial = firstName?.trim().charAt(0) ?? '';
  const lastInitial = lastName?.trim().charAt(0) ?? '';

  return `${firstInitial}${lastInitial}`.toUpperCase();
}
