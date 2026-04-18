export function runCalculator(expression: string): string {
  const allowed = new Set("0123456789+-*/.() ".split(""));
  if (![...expression].every((c) => allowed.has(c))) {
    return "Error: only numbers and +-*/.() are allowed.";
  }
  try {
    const result = new Function(`return (${expression})`)();
    return String(result);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}
