export function isLuhnValid(input: string): boolean {
  const digits = input.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0; const parity = digits.length % 2;
  for (let i=0;i<digits.length;i++) { let n=Number(digits[i]); if (i%2===parity) { n*=2; if(n>9)n-=9; } sum+=n; }
  return sum%10===0;
}