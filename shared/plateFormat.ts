/** Only the explicit Jubli Emas series; never rewrite other plate prefixes. */
export function jubliEmasPlate(value: string): string | null {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  const match = /^(?:JUBLIEMAS|JE)([1-9][0-9]{0,3})$/.exec(compact);
  return match ? `JE${match[1]}` : null;
}

export function plateSearchKey(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return compact.replace(/^JUBLIEMAS(?=[0-9]*$)/, "JE");
}
