const url = require('url')

const parseBodySteps = require('./parse_body')

const StatusMessage = {
    100: 'Continue',
    101: 'Switching Protocols',
    102: 'Processing',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    207: 'Multi-Status',
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Move temporarily',
    303: 'See Other',
    304: 'Not Modified',
    305: 'Use Proxy',
    306: 'Switch Proxy',
    307: 'Temporary Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Request Entity Too Large',
    414: 'Request-URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Requested Range Not Satisfiable',
    417: 'Expectation Failed',
    421: 'too many connections',
    422: 'Unprocessable Entity',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Unordered Collection',
    426: 'Upgrade Required',
    449: 'Retry With',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates',
    507: 'Insufficient Storage',
    509: 'Bandwidth Limit Exceeded',
    510: 'Not Extended',
    600: 'Unparseable Response Headers'
}

function writePromise(socket, data) {
    return new Promise(function(resolve, reject) {
        const timeout = setTimeout(solve, 5000)

        function solve() {
            clearTimeout(timeout)
            resolve()
        }

        if (socket.destroyed) {
            solve()
        } else {
            if (!socket.write(data)) {
                socket.once('drain', solve)
            } else {
                solve()
            }
        }
    })
}

class HTTPContext {
    constructor() {}
    init(http, chunk) {
        this._socket = http.socketRequest.socket
        this.chunk = chunk
        this._http = http
        this.url = http.path
        this.method = http.method
        this.keepaLiveTimeout = HTTPContext.keepaLiveTimeout
        this.keepAliveMaxRequests = HTTPContext.keepAliveMaxRequests

        this.reqHeader = http.headerMap
        this.reqBody = {}
        this.reqQuery = {}
        this.reqParam = {}
        this.parsedUrl = url.parse(decodeURI(this.url), true)
        this.parsedUrl.pathname = decodeURIComponent(this.parsedUrl.pathname)
        this.locals = {}
        this.statusCode = 200
        this.statusMessage = StatusMessage[200]
        this.resHeader = new Map
        this.resHeaderData = null
        this.isResHeaderSent = false
        this.body = undefined
        this.isChunkedStream = false
        return this
    }
    remove() {
        this._socket =
            this.chunk =
            this._http =
            this.url =
            this.method =
            this.reqHeader =
            this.reqBody =
            this.reqQuery =
            this.reqParam =
            this.parsedUrl =
            this.locals =
            this.statusMessage =
            this.resHeader =
            this.resHeaderData =
            this.isResHeaderSent =
            this.body = null
        HTTPContext.collect(this)
    }
    setStreamBody(stream) {
        this.body = stream
        this.isChunkedStream = true
    }
    async writeStream(stream) {
        this.setResponseHeader('transfer-encoding', 'chunked')

        await new Promise((resolve, reject) => {
            const ondata = async(chunk) => {
                stream.pause()
                await this.write(chunk)
                stream.resume()
            }
            const onend = async() => {
                await this.write()
                stream.removeListener('data', ondata)
                stream.removeListener('end', onend)
                resolve()
            }
            stream.on('data', ondata)
            stream.on('end', onend)
        })
    }
    async send() {
        if (this.method == 'head' || this.method == 'options') {
            this.body = undefined
            this.isChunkedStream = false
            await this.write()
            return
        }

        if (!this.getResponseHeader('content-type')) {
            this.setResponseHeader('content-type', 'text/html')
        }

        if (this.isChunkedStream) {
            await this.writeStream(this.body)
            return
        } else {
            await this.write(this.body)
            return
        }
    }
    async write(data) {
        let length = 0
        if (data === undefined) {
            length = 0
        } else if (Buffer.isBuffer(data)) {
            length = data.length
        } else if (typeof data == 'string') {
            length = Buffer.byteLength(data)
        } else {
            data = JSON.stringify(data)
            length = Buffer.byteLength(data)
            this.setResponseHeader('content-type', 'application/json')
        }

        await this._writeHeader(length)
        await this._write(this._socket, data, length)
    }
    async _writeHeader(length) {
        if (!this.isResHeaderSent) {
            const bytes = []
            bytes.push('HTTP/1.1 ' + this.statusCode + ' ' + this.statusMessage)
            this.setResponseHeader('connection', 'keep-alive')
            this.setResponseHeader('keep-alive', 'timeout=' + this.keepaLiveTimeout + ', max=' + this.keepAliveMaxRequests)
            if (this.isChunkedStream) {
                this.removeResponseHeader('content-length')
            } else {
                this.removeResponseHeader('transfer-encoding')
                this.setResponseHeader('content-length', length)
            }
            for (let [key, value] of this.resHeader) {
                bytes.push((key == 'set-cookie' ? '' : (key + ': ')) + value.toString())
            }
            bytes.push('\r\n')
            await writePromise(this._socket, bytes.join('\r\n'))

            this.isResHeaderSent = true
        }
    }
    async _write(socket, data, length) {
        if (this.isChunkedStream) {
            if (data === undefined) {
                await writePromise(socket, '0\r\n\r\n')
            } else {
                await writePromise(socket, length.toString(16) + '\r\n')
                await writePromise(socket, data)
                await writePromise(socket, '\r\n')
            }
        } else {
            if (data === undefined) {
                return
            }
            await writePromise(socket, data)
        }
    }
    setStatus(statusCode, message) {
        this.statusCode = statusCode
        this.statusMessage = message || StatusMessage[message] || ''
    }
    setResponseHeader(key, value) {
        this.resHeader.set(key.toLowerCase(), value)
    }
    removeResponseHeader(key) {
        this.resHeader.delete(key.toLowerCase())
    }
    getResponseHeader(key) {
        return this.resHeader.get(key)
    }
    async parseBody() {
        await this.handlerMiddlewares(parseBodySteps)
    }
    async handlerMiddlewares(middlewares) {
        let index = 0
        const ctx = this
        async function next(...prevValues) {
            if (index < middlewares.length) {
                await (middlewares[index++])(ctx, next, ...prevValues)
            }
        }
        await next()
    }
}
HTTPContext.MAX_CACHE_NUM = 1000
HTTPContext.keepaLiveTimeout = 20
HTTPContext.keepAliveMaxRequests = 100

const cache = []

HTTPContext.get = function(...args) {
    return (cache.length ? cache.pop() : new HTTPContext).init(...args)
}

HTTPContext.collect = function(ctx) {
    if (cache.length < this.MAX_CACHE_NUM) {
        cache.push(ctx)
    }
}
module.exports = HTTPContext