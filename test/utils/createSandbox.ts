import Sinon from "sinon";
import type { SinonSandbox } from "sinon";

export function createSandbox() {
  let sandbox;

  beforeEach(() => {
    sandbox = Sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  return new Proxy({} as SinonSandbox, {
    get(_, key) {
      if (!sandbox) {
        return undefined;
      }

      return sandbox[key];
    },
    set(...args) {
      return Reflect.set(...args);
    },
  });
}
