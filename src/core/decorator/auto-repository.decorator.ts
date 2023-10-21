import { ObjectLiteral } from "typeorm";
import RouteContainer from "@src/core/RouteContainer";

/**
 * Creates Custom typeorm repository class.
 * Route Container will gives manager dynamically
 * and create repository with value of Entity
 */
export const AutoRepository = <Entity extends ObjectLiteral>(
  entity: Entity,
): ClassDecorator => {
  return (TargetRepository) => {
    RouteContainer.set({ type: TargetRepository, entity });
  };
};
