// The Flutter models declare fields such as `double? weightKg` and assign the raw
// decoded JSON value. On Android/iOS, Dart decodes `70` as an int and `70.0` as a
// double, and assigning an int to a `double?` field throws. JSON.stringify emits
// 70.0 as `70`, so we force a ".0" on the keys the app reads as doubles.
const DOUBLE_KEYS = new Set(['weightKg']);
const MARK = '__DBL__';

export function dartSafeStringify(body) {
  const text = JSON.stringify(body, (key, value) =>
    DOUBLE_KEYS.has(key) && typeof value === 'number' && Number.isInteger(value)
      ? `${MARK}${value}`
      : value
  );
  if (text === undefined) return 'null';
  return text.replace(new RegExp(`"${MARK}(-?\\d+)"`, 'g'), '$1.0');
}

export function dartSafeJson(req, res, next) {
  res.json = (body) => {
    if (!res.get('Content-Type')) res.type('application/json');
    return res.send(dartSafeStringify(body));
  };
  next();
}
