import test from "node:test";
import { checkProject } from "../scripts/check-project.js";
test("publishable structure, refreshed assets, removed export, no public secrets", checkProject);
