export const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const formatOptionalNumber = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "—" : formatNumber(value, digits);
