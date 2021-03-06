const sequential = require('promise-sequential');
const ora = require('ora');
const { readJsonFile } = require('../extensions/amplify-helpers/read-json-file');

const spinner = ora('');

const { getProviderPlugins } = require('../extensions/amplify-helpers/get-provider-plugins');

module.exports = {
  name: 'build',
  run: async context => {
    try {
      context.amplify.constructExeInfo(context);
      await syncCurrentCloudBackend(context);
      return await context.amplify.buildProject(context);
    } catch (e) {
      context.print.error(`CRITICAL: An error occurred during the build operation: ${e.message}`);
      console.error(e.stack);
      process.exit(1);
    }
  },
};

// The following code pulls the latest backend to #current-cloud-backend
// so the amplify status is correctly shown to the user before the user confirms
// to push his local developments
async function syncCurrentCloudBackend(context) {
  context.exeInfo.restoreBackend = false;

  const currentEnv = context.exeInfo.localEnvInfo.envName;

  try {
    const { projectPath } = context.exeInfo.localEnvInfo;
    const providerInfoFilePath = context.amplify.pathManager.getProviderInfoFilePath(projectPath);
    const amplifyMeta = {};
    amplifyMeta.providers = readJsonFile(providerInfoFilePath)[currentEnv];

    const providerPlugins = getProviderPlugins(context);

    const pullCurrentCloudTasks = [];

    context.exeInfo.projectConfig.providers.forEach(provider => {
      const providerModule = require(providerPlugins[provider]);
      pullCurrentCloudTasks.push(() => providerModule.initEnv(context, amplifyMeta.providers[provider]));
    });

    spinner.start(`Fetching updates to backend environment: ${currentEnv} from the cloud.`);
    await sequential(pullCurrentCloudTasks);
    spinner.succeed(`Successfully pulled backend environment ${currentEnv} from the cloud.`);
  } catch (e) {
    spinner.fail(`There was an error pulling the backend environment ${currentEnv}.`);
    console.error(e.stack);
    throw e;
  }
}
