// Freezes a value and all it holds, Maps and Sets included (their own methods that change them throw), so a reducer
// that changes its argument fails at once.
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (value instanceof Map) {
    for (const [k, v] of value) {
      deepFreeze(k);
      deepFreeze(v);
    }
    const refuse = () => {
      throw new TypeError('a frozen Map was changed');
    };
    Object.assign(value, { set: refuse, delete: refuse, clear: refuse });
  } else if (value instanceof Set) {
    for (const v of value) deepFreeze(v);
    const refuse = () => {
      throw new TypeError('a frozen Set was changed');
    };
    Object.assign(value, { add: refuse, delete: refuse, clear: refuse });
  }
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}
