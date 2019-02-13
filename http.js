const util = require('util')
const HTTPContext = require('./http_context')
const HTTPChunk = require('./http_chunk')
const {parseByte} = require('./util')
const debug = util.debuglog('fast_tcp_server')

class HTTP {
    constructor() {}
    init(socketRequest) {
        this.socketRequest = socketRequest
        this.method = socketRequest.requestLine.method.toLowerCase()
        this.path = socketRequest.requestLine.path
        this.version = socketRequest.requestLine.version
        this.headers = socketRequest.headers
        this.headerMap = socketRequest.headerMap
        this.bodyBytes = null
        this.bodyLength = -1
        this.bodyTotalLength = 0
        this.state = 0
        this.bodyReadLength = 0
        this.bodyLengthBytes = null
        this.setBodyLength(this.headerMap)
        return this
    }
    setBodyLength(header) {
        if (header['content-length']) {
            this.state = 200
            this.bodyLength = this.headerMap['content-length'] | 0
            this.bodyBytes = HTTPChunk.get(this.bodyLength)
        }
        if (header['transfer-encoding'] == 'chunked') {
            this.state = 300
            this.bodyLengthBytes = []
            this.bodyLength = 0
        }
    }
    async parse(data, index) {
        if (this.bodyLength == -1) {
            await this.addContext(this.bodyBytes)
            return index
        }
        const total = data.length
        while (index < total) {
            const byte = data[index]
            switch (this.state) {
                case 200:
                    if ((this.bodyReadLength + data.length) <= this.bodyLength) {
                        data.copy(this.bodyBytes.buffer, this.bodyReadLength, index)
                        this.bodyReadLength += data.length
                        index += data.length
                    } else {
                        //buf.copy(target[, targetStart[, sourceStart[, sourceEnd]]])
                        data.copy(this.bodyBytes.buffer, this.bodyReadLength, index)

                        index += this.bodyLength - this.bodyReadLength
                        this.bodyReadLength = this.bodyLength
                    }
                    if (this.bodyReadLength == this.bodyLength) {
                        await this.addContext(this.bodyBytes)
                        this.bodyReadLength = 0
                        return index
                    }
                    break
                case 300:
                    index++
                    if (byte == 13) {
                        this.state = 301
                        break
                    }
                    this.bodyLengthBytes.push(byte)
                    break
                case 301:
                    index++
                    if (byte == 10) {
                        this.state = 302
                        const chunkLength = parseInt(this.bodyLengthBytes.map(parseByte).join('').toString(), 16)
                        this.bodyTotalLength += chunkLength
                        this.bodyLengthBytes.length = 0
                        if (chunkLength == 0) {
                            if (this.bodyBytes) {
                                this.bodyBytes = this.bodyBytes.integrate(this.bodyTotalLength)
                                await this.addContext(this.bodyBytes)
                                return index
                            }
                            this.socketRequest.error('parser.no_chunk_data')
                            break
                        }
                        const next = HTTPChunk.get(chunkLength)
                        if (this.bodyBytes) {
                            next.prev = this.bodyBytes
                        }
                        this.bodyLength = chunkLength
                        this.bodyReadLength = 0
                        this.bodyBytes = next
                        break
                    }
                    break
                case 302:
                    index++
                    if (this.bodyReadLength < this.bodyLength) {
                        this.bodyBytes.buffer[this.bodyReadLength++] = byte
                        if (this.bodyReadLength == this.bodyLength) {
                            this.state = 303
                        }
                        break
                    }
                    break
                case 303:
                    index++
                    if (byte == 13) {
                        this.state = 304
                    }
                    break
                case 304:
                    index++
                    if (byte == 10) {
                        this.state = 300
                    }
                    break
                default:
                    return index
            }
        }
        return index
    }
    remove() {
        debug('remove http')
        if (this.bodyBytes) {
            this.bodyBytes.remove()
        }
        this.path =
            this.version =
            this.socketRequest =
            this.headers =
            this.headerMap =
            this.bodyBytes =
            this.bodyLengthBytes = null
        HTTP.collect(this)
    }
    async addContext(chunk) {
        await this.socketRequest.tcpServer.httpHandler.handleRequest(HTTPContext.get(this, chunk))
        this.end()
    }
    handleError() {}
    end() {
        debug('end', this.path)
        if (!this.socketRequest) {
            return
        }
        this.socketRequest.resetRequestState()
        if ((this.headerMap.connection || '').toString().toLowerCase() == 'close') {
            this.socketRequest.remove()
        }
    }
}
const cache = []
HTTP.get = function(socketRequest) {
    return (cache.length ? cache.pop() : new HTTP).init(socketRequest)
}
HTTP.collect = function(http) {
    cache.push(http)
}
module.exports = HTTP