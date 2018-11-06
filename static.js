const fs = require('fs')
const path = require('path')
const mime = require('mime')
const debug = util.debuglog('fast_tcp_server')

function Static(config) {
    config = config || {}
    const immutable = config.immutable
    const maxage = config.maxage || 0
    if (!config.root) {
        config.root = '/'
    }
    return async function(ctx, next) {
        debug('try to static', ctx.url)
        switch (ctx.method) {
            case 'get':
            case 'head':
            case 'options':
                break
            default:
                await next()
                return
        }
        const parsedUrl = ctx.parsedUrl
        const normalized = path.normalize(parsedUrl.pathname)
        if (normalized == '/') {
            await next()
            return
        }
        if (normalized != parsedUrl.pathname) {
            ctx.setStatus(301)
            ctx.setResponseHeader('Location', normalized + parsedUrl.search)
            return
        }
        const filePath = path.join(process.cwd(), config.root, normalized)
        const ext = path.extname(filePath)
        const fileType = ext ? ext.slice(1) : 'binary'
        let stat = await new Promise(function(resolve, reject) {
            fs.stat(filePath, function(e, stat) {
                resolve(e ? null : stat)
            })
        })
        if (!stat) {
            if (!config.next) {
                ctx.setStatus(404, 'Not Found')
                ctx.body = 'Not Found'
                return
            }
            await next()
            return
        }

        if (stat.isDirectory()) {
            ctx.setStatus(401, 'Directory not allowed to be show')
            ctx.body = 'Directory not allowed to be show'
        } else {
            const ifNoneMatch = ctx.reqHeader['if-none-match']
            const lastModified = stat.mtime.getTime() + ''
            ctx.setResponseHeader('Last-Modified', stat.mtime.toUTCString())
            ctx.setResponseHeader('Cache-Control', 'public, max-age=' + maxage + (immutable ? ',immutable' : ''))
                // ctx.setResponseHeader('')
            ctx.setResponseHeader('access-control-allow-origin', '*')
            ctx.setResponseHeader('access-control-allow-credentials', '*')
            ctx.setResponseHeader('access-control-expose-headers', '*')
                // ctx.setResponseHeader('access-control-max-age', '')
            ctx.setResponseHeader('access-control-allow-methods', '*')
                // ctx.setResponseHeader('access-control-allow-headers', '')
            if (ifNoneMatch == lastModified) {
                ctx.setStatus(304, 'Not Modified')
                ctx.body = ''
            } else {
                const contentType = mime.getType(fileType) || mime.getType('bin')
                ctx.setResponseHeader('Content-Type', contentType)

                if (!config.acceptRange || (contentType.indexOf('video') == -1)) {
                    // ctx.setResponseHeader('Content-Length', stat.size)
                    ctx.setResponseHeader('ETag', lastModified)
                    ctx.setResponseHeader('Expires', new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString())
                    ctx.setStreamBody(fs.createReadStream(filePath))
                } else {
                    handleRange(ctx, filePath, stat.size, config)
                }
            }
        }
    }
}

function handleRange(ctx, filePath, size, config) {
    ctx.setResponseHeader('Accept-Ranges', 'bytes')
    ctx.setResponseHeader('Cache-Control', 'no-cache')
    const range = (ctx.reqHeader['range'] || '').toString().slice(6)
    let rangeStart
    let rangeEnd
    if (!range.length || range.indexOf(',') > -1) {
        rangeStart = 0
        rangeEnd = size - 1
    } else {
        const pair = range.split('-')
        const pairLength = pair.length
        switch (pair.length) {
            case 2:
                const from = pair[0]
                const end = pair[1]
                if (!from.length && !end.length) {
                    rangeStart = 0
                    rangeEnd = 0
                }
                if (from.length) {
                    rangeStart = Math.max(0, from | 0)
                }
                if (end.length) {
                    rangeEnd = Math.max(0, end | 0)
                }

                if (rangeStart === undefined) {
                    rangeStart = size - rangeEnd
                }
                if (rangeEnd === undefined) {
                    rangeEnd = size - 1
                }
                rangeStart = Math.min(rangeStart, size - 1)
                rangeEnd = Math.min(rangeEnd, size - 1)
                break
            case 0:
            case 1:
            default:
                rangeStart = 0
                rangeEnd = size - 1
                break
        }
    }
    if (config.maxPartialBlock) {
        rangeEnd = Math.min(rangeEnd, rangeStart + config.maxPartialBlock) //1024 * 1024)
    }
    const rangeLength = rangeEnd - rangeStart + 1
    ctx.setStatus(206)
    ctx.setResponseHeader('Content-Range', 'bytes ' + rangeStart + '-' + rangeEnd + '/' + size)
    ctx.setResponseHeader('Content-Length', rangeLength)
    ctx.setStreamBody(fs.createReadStream(filePath, { start: rangeStart, end: rangeEnd }))
}
module.exports = Static