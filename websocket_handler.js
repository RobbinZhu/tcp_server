class WebsocketHandler {
    constructor() {
        this.middlewares = []
    }
    async handleRequest(req, res) {}
    use(...middlewares) {
        this.middlewares.push(...middlewares)
        return this
    }
}
WebsocketHandler.get = function() {
    return new WebsocketHandler
}
module.exports = WebsocketHandler