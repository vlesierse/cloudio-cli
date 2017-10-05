const Api = require('kubernetes-client');

const getClusterConfig = () => {
    if (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) {
        return Api.config.getInCluster();
    }
    if (process.env.KUBERNETES_HOST) {
        return {
            url: process.env.KUBERNETES_HOST,
            version: process.env.KUBERNETES_VERSION || 'v1',
            namespace: process.env.KUBERNETES_NAMESPACE || 'default'
        }
    }
    return Api.config.fromKubeconfig();
};
const config = getClusterConfig();

exports = module.exports = {
    core: new Api.Core(config),
    extensions: new Api.Extensions(config)
}