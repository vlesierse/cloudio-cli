const fs = require('fs');
const uuid = require('uuid/v4');
const vamp = require('../api/vamp')();
const YAML = require('yamljs');
const sleep = require('../threading').sleep;
const waitFor = require('../threading').waitFor;
const handlebars = require('handlebars');
const handleError = require('../logging').handleError;

const updateDeployment = async (deployment, service, configuration, options) => {
    var b = await createBlueprint(service, configuration, options.cluster, options.breed, options.deployable);
    var d = await vamp.deployment.merge(deployment, service);
    console.log(`Merged blueprint ${b.name} with deployment ${d.name}`);
    var success = await checkDeployment(deployment, service, options.cluster, configuration);
    if (!success) {
        console.error(`Merge deployment ${d.name} failed`);
        process.exit(1);
    }
    await migrateGateway(deployment, service, configuration);
    console.log(`Deployed blueprint ${b.name} in deployment ${d.name}`);
    return d;
}

const createDeployment = async (deployment, service, configuration, options) => {
    var b = await createBlueprint(service, configuration, options.cluster, options.breed, options.deployable);
    var d = await vamp.deployment.deploy(deployment, service);
    console.log(`Deployed blueprint ${b.name} with deployment ${d.name}`);
    await createGateway(d, configuration);
    var success = await checkDeployment(deployment, service, options.cluster, configuration);
    if (!success) {
        console.error(`Create deployment ${d.name} failed`);
        process.exit(1);
    }
    console.log(`Deployed blueprint ${b.name} in deployment ${d.name}`);
    return d;
};

const createBlueprint = async (name, configuration, cluster, breed, deployable) => {
    if (!configuration.vamp || !configuration.vamp.blueprint) {
        throw `No blueprint found in file ${configuration.file}`;
    }
    let blueprint = configuration.vamp.blueprint;
    // Replace values in blueprint
    blueprint.name = name;
    var $cluster = blueprint.clusters[cluster || 0];
    if (!$cluster) {
        throw `Cluster ${cluster} not found in blueprint ${blueprint.name}`;
    }
    var $breed = $cluster.services.map(c => c.breed).find(b => b.name.startsWith(breed));
    if (!$breed) {
        throw `Breed which starts with ${breed} not found in blueprint ${blueprint.name}`;
    }
    $breed.name = name;
    $breed.deployable = deployable;
    return vamp.blueprint.create(blueprint);
};

const createGateway = async (deployment, configuration) => {
    if (!configuration.vamp || !configuration.vamp.gateway) {
        console.log(`No gateway found in file ${blueprintFile}`);
        return;
    }

    let gateway = configuration.vamp.gateway;
    let routeKey = Object.keys(gateway.routes)[0];
    var routeValue = gateway.routes[routeKey];
    var routeSegments = routeKey.split('/');
    routeSegments[0] = deployment.name;

    let routes = new Object();
    routes[routeSegments.join('/')] = routeValue;
    gateway.routes = routes;
    let g = await vamp.gateway.create(gateway);
    console.log(`Created gateway ${g.name}`);
    return g;
};

const checkDeployment = async (deployment, service, cluster, configuration) => {
    return waitFor(async () => {
        console.log(`Check deployment ${deployment}`);
        let d = await vamp.deployment.get(deployment);
        var s = d.clusters[cluster || 0].services.find(s => s.breed.name === service);
        console.log(`Deployment ${d.name}-${s.breed.name}: ${s.status.phase.name}`);
        return s.status.phase.name === 'Done';
    }, configuration.deployment.timeout * 1000, 5 * 1000);
}

const migrateGateway = async (deployment, service, configuration) => {
    let externalGateway = await vamp.gateway.get(deployment);
    var gatewayName = Object.keys(externalGateway.routes)[0];
    var gateway = await vamp.gateway.get(gatewayName);
    var gatewayRoutes = Object.keys(gateway.routes);
    var sourceRoute = gatewayRoutes.find(r => r.split('/').indexOf(service) < 0);
    var targetRoute = gatewayRoutes.find(r => r.split('/').indexOf(service) >= 0);

    var workflowId = uuid();
    var workflow = {
        name: `${deployment}-${workflowId}`,
        breed: { reference: configuration.deployment.strategy.name },
        schedule: 'daemon',
        environment_variables: {
            GATEWAY: gatewayName,
            GATEWAY_SOURCE: sourceRoute,
            GATEWAY_TARGET: targetRoute,
            WORKFLOW_ID: workflowId,
            DEPLOYMENT_STEP: configuration.deployment.strategy.step,
            DEPLOYMENT_PERIOD: configuration.deployment.strategy.period,
            VAMP_WORKFLOW_EXECUTION_PERIOD: 0,
            VAMP_WORKFLOW_EXECUTION_TIMEOUT: 0
        }
    }
    if (configuration.deployment.strategy.metric.name && configuration.deployment.strategy.metric.expression) {
            workflow.environment_variables['METRIC_NAME'] = configuration.deployment.strategy.metric.name;
            workflow.environment_variables['METRIC_EXPRESSION'] = configuration.deployment.strategy.metric.expression;
    }
    await vamp.workflow.create(workflow);
    console.log(`Created migration workflow ${workflow.name}`);
    var migrated = await waitFor(async () => {
        var events = await vamp.event.list('deployment', workflowId);
        if (events.find(e => e.tags.indexOf('aborted') >= 0)) {
            throw 'Migration aborted';
        }
        return events.find(e => e.tags.indexOf('finished') >= 0);
    }, configuration.deployment.strategy.timeout * 1000, 5 * 1000);
    await vamp.workflow.delete(workflow.name);
    console.log(`Deleted workflow ${workflow.name}`);
    if (migrated) {
        var sourceService = sourceRoute.split('/')[2];
        sleep(5000);
        await vamp.deployment.undeploy(deployment, sourceService);
        console.log(`Removed service ${sourceService} from deployment ${deployment}`);
        console.log(`Migrated gateway ${gateway.name} from ${sourceRoute} to ${targetRoute}`);
    } else {
        await vamp.deployment.undeploy(deployment, service);
        console.error(`Migration aborted. Rolled back gateway ${gateway.name} to ${sourceRoute}`);
    }
}

const defaults = {
    file: '.cloudio.yml',
    deployment: {
        timeout: 30,
        strategy: {
            name: 'canary',
            step: 25,
            period: 15,
            timeout: 60,
            metric: {}
        }
    },
    vamp: { }
}

const readConfiguration = file => {
    if (!fs.existsSync(file)) {
        throw `Deployment file ${file} not found`;
    }
    var content = fs.readFileSync(file, 'utf-8');
    var template = handlebars.compile(content);
    content = template(process.env);
    let configuration = YAML.parse(content);
    return Object.assign({ }, defaults, configuration);
}

module.exports = (program) => {
    program
        .command('deploy <deployment> <service>')
        .description('Creates a deployment, based on a strategy.')
        .option('-f, --file <file>', 'Use blueprint from file. Default .vamp.yml')
        .option('-b, --breed <name>', 'The breed to replace in the blueprint.')
        .option('-s, --source <name>', 'Use an already deployed blueprint')
        .option('-c, --cluster <name>', 'The cluster to place the new breed in. Defaults to the first cluster')
        .option('-d, --deployable <image>', 'Deployable to replace in the blueprint')
        .action(async (deployment, service, options) => {
            if (!options.deployable || !options.breed) {
                return console.log('Please provide options for <deployable>, <breed> for deployment')
            } else {
                let configuration = readConfiguration(options.file || defaults.file);
                try {
                    await vamp.deployment.get(deployment);
                } catch (err) {
                    if (err.response && err.response.status === 404) {
                        await createDeployment(deployment, service, configuration, options)
                    } else {
                        handleError(err);
                        process.exit(1);
                    }
                    return;
                }
                updateDeployment(deployment, service, configuration, options);
            }
        });
    program.command('test').action(async (options) => {
        let configuration = readConfiguration(defaults.file);
        console.log("Done");
    });
}