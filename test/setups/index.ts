import { initTestBase } from "./base.setup";
import { initTestSession } from "@test/setups/session.setup";
import { initTestTypeorm } from "@test/setups/typeorm.setup";

const configureSetups = () => {
  [initTestBase, initTestSession, initTestTypeorm].forEach((loader) =>
    loader(),
  );
};

configureSetups();
