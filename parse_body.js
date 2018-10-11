const qs = require('querystring')
const StreamSearch = require('streamsearch')
async function parseMultiForm(buffer, boundary, boundaryLen) {
    return new Promise(function(resolve, reject) {
        const bparser = new StreamSearch('\r\n--' + boundary)
        let isFirstMatch = false
        const body = {}
        bparser.on('info', function(isMatch, data, start, end) {
            const part = data.slice(start, end)
            let filename, name, headers, buffer, fileContentType
            if (!isFirstMatch) {
                const headerEndIndex = part.indexOf('\r\n\r\n', boundaryLen)
                headers = part.slice(boundaryLen + 4, headerEndIndex).toString().split('\r\n')
                buffer = part.slice(headerEndIndex + 4)
                isFirstMatch = true
            } else if (part.length < boundaryLen) {
                isFirstMatch = null
                resolve(body)
                return
            } else {
                const headerEndIndex = part.indexOf('\r\n\r\n')
                headers = part.slice(2, headerEndIndex).toString().split('\r\n')
                buffer = part.slice(headerEndIndex + 4)
            }
            if (headers.length > 0) {
                const pairs = headers[0].split('; ')
                for (let i = 1, j = pairs.length; i < j; i++) {
                    const pair = pairs[i].split('=')
                    if (pair.length != 2) {
                        continue
                    }
                    const key = pair[0]
                    if (key == 'name') {
                        name = pair[1].slice(1, -1)
                    } else if (key == 'filename') {
                        filename = pair[1].slice(1, -1)
                    }
                }
            }
            if (headers.length > 1) {
                const pair = headers[1].split(': ')
                if (pair.length == 2 && pair[0].toLowerCase() == 'content-type') {
                    fileContentType = pair[1]
                }
            }
            if (name) {
                body[name] = filename ? buffer : buffer.toString()
            }
        });
        bparser.push(buffer)
    })
}
module.exports = [
    async function(ctx, next) {
        const contentType = ctx.reqHeader['content-type']
        if (ctx.parsedUrl && ctx.parsedUrl.search) {
            const query = qs.parse(ctx.parsedUrl.search.slice(1))
            const reqQuery = {}
            Object.keys(query).forEach(function(key) {
                reqQuery[key.toString()] = query[key].toString()
            })
            ctx.reqQuery = reqQuery
        }
        switch (ctx.method) {
            case 'head':
            case 'get':
            case 'options':
                await next()
                return
                break
            default:
                break
        }

        await next(ctx.chunk ? ctx.chunk.buffer : undefined)
    },
    async function(ctx, next, buffer) {
        if (buffer && buffer.byteLength) {
            const contentType = ctx.reqHeader['content-type']
            if (!contentType) {
                ctx.reqBody = buffer.toString()
            } else if (contentType.indexOf('application/x-www-form-urlencoded') > -1) {
                //urlencoded form
                const reqBody = {}
                Object.assign(reqBody, qs.parse(buffer.toString()))
                ctx.reqBody = reqBody
            } else if (contentType.indexOf('application/json') > -1) {
                //json
                console.log(buffer.toString())

                ctx.reqBody = JSON.parse(buffer.toString())
                console.log(ctx.reqBody)
            } else if (contentType.indexOf('multipart/form-data') > -1) {
                //multipart form data
                const boundary = contentType.slice(contentType.indexOf('boundary=') + 9)
                const boundaryLen = boundary.length
                ctx.reqBody = await parseMultiForm(buffer, boundary, boundaryLen)
            }
        }
        await next()
    }
]