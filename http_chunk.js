class HttpChunk {
    constructor() {}
    init(length) {
        this.buffer = Buffer.alloc(length)
        this.prev = null
        return this
    }
    remove() {
        let prev = this.prev
        let temp
        while (prev) {
            temp = prev
            prev = temp.prev
            temp.remove()
        }
        this.buffer = this.prev = null
        HttpChunk.collect(this)
    }
    integrate(length) {
        const chunk = HttpChunk.get(length)
        let link = this
        let index = length
        while (link) {
            //buf.copy(target[, targetStart[, sourceStart[, sourceEnd]]])
            length -= link.buffer.length
            link.buffer.copy(chunk.buffer, length)
            const temp = link
            link = link.prev
            temp.remove()
        }
        return chunk
    }
}
HttpChunk.MAX_CACHE_NUM = 1000
const cache = []
HttpChunk.get = function(length) {
    return (cache.length ? cache.pop() : new HttpChunk).init(length)
}
HttpChunk.collect = function(chunk) {
    if (cache.length < HttpChunk.MAX_CACHE_NUM) {
        cache.push(chunk)
    }
}
module.exports = HttpChunk