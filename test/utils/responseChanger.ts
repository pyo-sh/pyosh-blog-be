export function responseChanger<T>(data: T) {
  if (data instanceof Date) {
    return data.toISOString();
  }

  if (data instanceof Array) {
    return data.map(responseChanger);
  }

  if (data instanceof Object) {
    return Object.entries(data).reduce((newObj, [key, value]) => {
      newObj[key] = responseChanger(value);

      return newObj;
    }, {} as T);
  }

  return data;
}
