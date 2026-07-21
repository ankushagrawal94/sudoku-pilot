import { inspectWarehouse } from "./warehouse.mjs";

console.log(JSON.stringify(await inspectWarehouse(), null, 2));
