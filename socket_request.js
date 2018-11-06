// const WebSocket = require('./websocket')
const HTTP = require('./http')
const ServerError = require('./server_error')

const START_GET_LINE = 0

const PRE_END_GET_LINE = 9
const END_GET_LINE = 10

const PRE_END_HEADER_LINE = 19
const END_HEADER_LINE = 20

const PRE_END_HEADER = 99
const END_NORMAL_HEADER = 100

const END_UPGRADE_HEADER = 200

const ErrorCode = {
    'parser.end_line_char_error': 1,
    'parser.max_header_overflow': 2,
    'parser.end_header_char_error': 3,
    'parser.not_support_protocol': 4
}
class SocketRequest {
    constructor() {}
    init(socket, server) {
        this.socket = socket
        this.tcpServer = server
        this.requestState = 0
        this.requestLineBytes = []
        this.requestLine = null
        this.headerLineBytes = []
        this.headers = []
        this.headerMap = {}
        this.currentHeaderLine = null
        this.maxHeaderCount = 100

        let promise = Promise.resolve()
        this.dataParseQueue = function(data) {
            promise = promise.then(async() => {
                // console.log('run')
                // console.log('parse', data.toString())
                await this.parse(data)
                    // console.log('parsedsuccess')
            }).catch((e) => {
                console.log('inner error', e)
                if (e.code && e.code < 100) {
                    console.log('crash error')
                    this.remove()
                } else {
                    this.webRequest && this.webRequest.handleError(e)
                    console.log('not crash error')
                }
            })
        }
        this.webRequest = null
        this.socket.on('data', this.dataParseQueue.bind(this))
        this.socket.on('error', this.onSocketError.bind(this))
        this.socket.on('close', this.onSocketClose.bind(this))
        this.socket.on('timeout', this.onSocketTimeout.bind(this))
        this.socket.setTimeout(30000)
        return this
    }
    resetRequestState() {
        console.log('reset requestState', this.requestLine)
        this.requestLine = null
        this.requestState = 0
        this.requestLineBytes = []
        this.headerLineBytes = []
        this.headers = []
        this.headerMap = {}
        this.currentHeaderLine = null
        this.webRequest = null
    }
    remove() {
        this.close()
        SocketRequest.collect(this)
    }
    close() {
        if (this.webRequest) {
            this.webRequest.remove()
        }
        if (this.socket) {
            this.socket.removeAllListeners()
            if (!this.socket.destroyed) {
                console.log('destroy socket', this.socket.realSocketIndex)
                this.socket.destroy()
            }
        }
        this.tcpServer =
            this.webRequest =
            this.socket =
            this.dataParseQueue =
            this.requestLine =
            this.requestLineBytes =
            this.headerLineBytes =
            this.headers =
            this.headerMap =
            this.currentHeaderLine = null
    }
    onSocketError() {
        this.remove()
    }
    onSocketClose() {
        this.remove()
    }
    onSocketTimeout() {
        this.remove()
    }
    async parse(data) {
        let total = data.length
        let index = 0
        while (index < total) {
            const byte = data[index]
            switch (this.requestState) {
                case 200:
                    if (!this.webRequest) {
                        this.error('parser.no_server_for_your_request')
                        break
                    }
                    index = await this.webRequest.parse(data, index)
                    break
                case 0: //START_GET_LINE
                    if (byte == 13 /*\r*/ ) { //PRE_END_GET_LINE
                        this.requestState = 9
                        break
                    }
                    this.requestLineBytes.push(byte)
                    break
                case 9: //PRE_END_GET_LINE
                    if (byte == 10 /*\n*/ ) { //END_GET_LINE
                        this.requestState = 10
                        break
                    }
                    this.error('parser.end_line_char_error')
                    break
                case 10: //END_GET_LINE,START_HEADR_LINE
                    if (byte == 13) { //will end current line || end header
                        this.requestState = this.currentHeaderLine ? 19 : 99
                        break
                    }
                    if (!this.currentHeaderLine) {
                        if (this.headerLineBytes.length > this.maxHeaderCount) {
                            //error handler
                            this.error('parser.max_header_overflow')
                            break
                        }
                        this.currentHeaderLine = []
                    }
                    this.currentHeaderLine.push(byte)
                    break
                case 19: //PRE_END_HEADER_LINE
                    if (byte == 10) {
                        this.headerLineBytes.push(this.currentHeaderLine)
                        this.currentHeaderLine = null
                        this.requestState = 20
                        break
                    }
                    return this.error('parser.end_line_char_error')
                    break
                case 20: //END_HEADER_LINE
                    if (byte == 13) {
                        this.requestState = 99
                        break
                    }
                    this.requestState = 10
                    index--
                    break
                case 99: //PRE_END_HEADER
                    if (byte == 10) {
                        const passRequestLine = await this.generateRequestLine(this.requestLineBytes)
                        const passRequestHeaders = await this.generateRequestHeaders(this.headerLineBytes)
                        if (passRequestLine && passRequestHeaders) {
                            this.requestState = 200 //this.headerMap.upgrade ? 200 : 100
                            await this.handleRequestHeaders()
                            if (this.webRequest) {
                                index = await this.webRequest.parse(data, index + 1)
                            }
                            break
                        }
                    }
                    this.error('parser.end_header_char_error')
                    break
            }
            index++
        }
    }
    async handleRequestHeaders() {
        if ((this.headerMap.upgrade || '').toString().toLowerCase() == 'websocket') {
            // this.webRequest = WebSocket.get(this)
        } else {
            // console.log('get request from webRequest')
            // this.socket.end('HTTP/1.1 200 ok\r\nContent-Length:0\r\n\r\n')
            this.webRequest = HTTP.get(this)
                // this.error('parser.not_support_protocol')
        }
    }
    error(msg, code) {
        throw new ServerError(code || ErrorCode[msg], msg)
    }
    async generateRequestLine(requestLineBytes) {
        const line = requestLineBytes.map(function(number) {
            return String.fromCharCode(number)
        }).join('').split(' ')
        if (line.length == 3) {
            const [method, path, version] = line
            this.requestLine = {
                method,
                path,
                version
            }
            console.log('request line got', method, path, version)
            return true
        }
        return false
    }
    async generateRequestHeaders(headers) {
        const headerMap = {}

        this.headers = headers
            .map(function(header) {
                return header.map(function(code) {
                    return String.fromCharCode(code)
                }).join('')
            })
        this.headers.forEach(function(header) {
            const keyIndex = header.indexOf(': ')
            if (keyIndex > 0) {
                headerMap[header.slice(0, keyIndex).toLowerCase()] = header.slice(keyIndex + 2)
            }
        })

        this.headerMap = headerMap
            // console.log('headers', this.headers.length)
        return true
    }
}

SocketRequest.MAX_CACHE_NUM = 1000

const cache = []
SocketRequest.get = function(socket) {
    return (cache.length ? cache.pop() : new SocketRequest).init(socket, this)
}

SocketRequest.collect = function(req) {
    if (cache.length < this.MAX_CACHE_NUM) {
        cache.push(req)
    }
}
module.exports = SocketRequest