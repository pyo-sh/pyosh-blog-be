export function omitObject<T extends object, K extends keyof T>(
  target: T,
  strings: K[],
): Omit<T, K> {
  return strings.reduce(
    (obj, key) => {
      if (Object.hasOwnProperty.call(target, key)) {
        delete obj[key];
      }

      return obj;
    },
    { ...target },
  );
}

export function pickObject<T extends object, K extends keyof T>(
  target: T,
  strings: K[],
): Pick<T, K> {
  return strings.reduce(
    (obj, key) => {
      if (Object.hasOwnProperty.call(target, key)) {
        obj[key] = target[key];
      }

      return obj;
    },
    { ...target },
  );
}
