const net = require('net')
const WebsocketHandler = require('./websocket_handler')
const HTTPHandler = require('./http_handler')
const SocketRequest = require('./socket_request')
class TCPServer {
    constructor() {
        this.httpHandler = HTTPHandler.get()
        this.websocketHandler = WebsocketHandler.get()
        this.server = net.createServer(SocketRequest.get.bind(this), {
            allowHalfOpen: false
        })
    }
    use(...middlewares) {
        this.httpHandler.use(...middlewares)
        return this
    }
    listen(port) {
        this.server.listen(port)
    }
}
module.exports = TCPServer