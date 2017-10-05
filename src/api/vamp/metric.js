/** Class representing an Event  */
class Metric {
    /**
     * @param {object} http - instantiated axios client
     */
    constructor(http) {
      this.http = http
    }
  
    get(path) {
        this.http
            .get(`/metrics/${path}`)
            .then(res => res.data);
    }
  }
  
  module.exports = (axiosInstance) => { return new Metric(axiosInstance) }