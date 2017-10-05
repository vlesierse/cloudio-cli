/** Class representing a Gateway resource */
class Gateway {
    /**
     * @param {object} http - instantiated axios client
     */
    constructor(http) {
        this.http = http
    }

    /**
     * Get a list of gateways
     * @return {Promise.<Array>}
     */
    async list() {
        var res = await this.http.get('/gateways');
        return res.data;
    }

    /**
     * Describes a single gateway resource
     * @param {string} name - name of the breed
     * @return {Promise.<Object>}
     */
    async get(name) {
        var res = await this.http.get(`/gateways/${name}`);
        return res.data;
    }

    /**
     * Deletes the artifact
     * @param {string} name - Name of the artifact
     * @return {Promise.<Object>}
     */
    delete(name) {
        return this.http
            .delete(`/gateways/${name}`)
            .then(res => { return res })
    }

    /**
     * Updates a gateway
     * @param {string} name - Name of the artifact
     * @param {object} payload - A full gateway artifact
     * @return {Promise.<Object>}
     */
    async update(name, payload) {
        var res = await this.http.put(`/gateways/${name}`, payload);
        return res.data;
    }

    /**
     * Creates a gateway
     * @param {object} payload - A full gateway artifact
     * @return {Promise.<Object>}
     */
    async create(payload) {
        var res = await this.http.post(`/gateways`, payload);
        return res.data;
    }
}

module.exports = (axiosInstance) => { return new Gateway(axiosInstance) }
