import RouteContainer from "@src/core/RouteContainer";

export const Injectable = (key?: string): ClassDecorator => {
  return (TargetClass) => {
    RouteContainer.set({ id: key, type: TargetClass });
  };
};
