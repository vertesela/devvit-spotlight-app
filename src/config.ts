export function escapeUsername(name: string): string {
  return name.replace(/_/g, "\\_");
}
