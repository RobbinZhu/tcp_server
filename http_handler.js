class HTTPHandler {
    constructor() {
        this.middlewares = []
    }
    async handleRequest(ctx) {
        await ctx.handlerMiddlewares(this.middlewares)
        await ctx.send()
        ctx.remove()
    }
    handleError() {}
    use(...middlewares) {
        this.middlewares.push(...middlewares)
        return this
    }
}
HTTPHandler.get = function() {
    return new HTTPHandler
}
module.exports = HTTPHandler