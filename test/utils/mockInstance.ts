import RouteContainer, { Constructable } from "@src/core/RouteContainer";

const mockInstance = <T = unknown>(TargetClass: Constructable<T>) => {
  const previousInstance = RouteContainer.getInstance(TargetClass) as T;
  const instance = RouteContainer.createInstance(TargetClass);

  before(() => {
    RouteContainer.setInstance(instance);
  });

  after(() => {
    RouteContainer.setInstance(previousInstance);
  });

  return instance;
};

export default mockInstance;
