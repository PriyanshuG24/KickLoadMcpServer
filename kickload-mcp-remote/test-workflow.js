import { generateTestPlan } from './src/tools/generatePlan.ts';
import { runLoadTest } from './src/tools/runLoadTest.ts';
import { getResults } from './src/tools/getResults.ts';

const config = {
    apiToken: 'a4297a9e070078a2f4d0f82f6d67fa22fe3431ad95221b2ffa0545b558af1ae6',
    baseUrl: 'https://api.neeyatai.com'
};

// Configuration
const testPrompt = "Test GET https://httpbin.org/get with 1 user for 10 seconds";

async function runTestWorkflow() {
    console.log('🚀 Starting KickLoad test workflow...\n');

    try {
        // Step 1: Generate test plan
        console.log('Step 1: Generating test plan...');
        const planResult = await generateTestPlan(
            { prompt: testPrompt },
            config
        );

        console.log(planResult.content[0].text);

        // Extract jmx_filename from the response
        const jmxMatch = planResult.content[0].text.match(/jmx_filename: "([^"]+)"/);
        if (!jmxMatch) {
            throw new Error('Could not extract jmx_filename from generateTestPlan response');
        }
        const jmxFilename = jmxMatch[1];
        console.log(`✅ Extracted JMX filename: ${jmxFilename}\n`);

        // Step 2: Run the load test
        console.log('Step 2: Running load test...');
        const testResult = await runLoadTest(
            {
                jmx_filename: jmxFilename,
                num_threads: 1,
                ramp_time: 10,
                duration: 10,
                loop_count: 1
            },
            config
        );

        console.log(testResult.content[0].text);

        // Extract task_id from the response
        const taskMatch = testResult.content[0].text.match(/Task ID:    ([^\s]+)/);
        if (!taskMatch) {
            throw new Error('Could not extract task_id from runLoadTest response');
        }
        const taskId = taskMatch[1];
        console.log(`✅ Extracted Task ID: ${taskId}\n`);

        // Step 3: Get results
        console.log('Step 3: Getting test results...');
        const resultsResult = await getResults(
            {
                task_id: taskId,
                thresholds: {
                    error_rate_pct: 5,
                    min_throughput_rps: 0.1
                }
            },
            config
        );

        console.log(resultsResult.content[0].text);
        console.log('\n✅ Test workflow completed successfully!');

    } catch (error) {
        console.error('❌ Error in test workflow:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the workflow
runTestWorkflow();
