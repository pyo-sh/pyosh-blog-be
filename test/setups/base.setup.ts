import express, { Express } from "express";
import Sinon from "sinon";
import * as BaseLoader from "@src/loaders/base";

export function initTestBase() {
  const loadBaseStub = Sinon.stub(BaseLoader, "loadBase").callsFake(
    (app: Express) => {
      app.use(express.json());
      app.use(express.urlencoded({ extended: false }));
    },
  );

  Sinon.replace(BaseLoader, "loadBase", loadBaseStub);
}
