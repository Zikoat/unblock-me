import { runWebVerification } from "./web-playwright.mjs";

const result = await runWebVerification();
console.log(`Playwright verified desktop mouse drag and mobile touch drag. Generated ${result.generatedSeed}.`);
