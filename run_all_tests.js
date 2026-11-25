import { runMenuAndUiTests } from './test_menu_and_ui.js';
import { runCacheAndTabsTests } from './test_cache_and_tabs.js';
import { runPipelineAndApiTests } from './test_pipeline_and_api.js';
import { runAskAndImagesTests } from './test_ask_and_images.js';
import { runSimulatorUiTests } from './test_simulator_ui.js';

async function main() {
  console.log('===============================================================');
  console.log(' YouTube Feed Summariser (Gemini) v2.12.0 — Acceptance Test Suite');
  console.log('===============================================================\n');

  const startTime = Date.now();
  let totalPassed = 0;
  let totalTests = 0;

  try {
    const s1 = await runMenuAndUiTests();
    totalPassed += s1.passed;
    totalTests += s1.total;

    const s2 = await runCacheAndTabsTests();
    totalPassed += s2.passed;
    totalTests += s2.total;

    const s3 = await runPipelineAndApiTests();
    totalPassed += s3.passed;
    totalTests += s3.total;

    const s4 = await runAskAndImagesTests();
    totalPassed += s4.passed;
    totalTests += s4.total;

    const s5 = await runSimulatorUiTests();
    totalPassed += s5.passed;
    totalTests += s5.total;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n===============================================================');
    console.log(` ALL ACCEPTANCE CHECKS PASSED: ${totalPassed}/${totalTests} in ${elapsed}s`);
    console.log('===============================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
