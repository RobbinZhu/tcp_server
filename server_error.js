class ServerError extends Error {
    constructor(message, code) {
        super(message)
        this.code = code
        this.message = message
    }
}
module.exports = ServerError