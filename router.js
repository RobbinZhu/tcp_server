const routerPart = /:[0-9a-zA-Z_-]+|[0-9a-zA-Z_-]+|\+|\*/ig

function format(text) {
    switch (text[0]) {
        case '*':
            return {
                name: '*',
                text: '(.*?)'
            }
            break
        case '+':
            return {
                name: '+',
                text: '(.+?)'
            }
            break
        case ':':
            return {
                name: text.slice(1),
                text: '([0-9a-zA-Z_-]+?)'
            }
            break
        default:
            return {
                name: '',
                text: text
            }
            break
    }
}

class Path {
    constructor(path) {
        const allMatches = []
        const allNames = []
        const formatPath = path.replace(/\/\//ig, '/')
        formatPath.split('/').map(item => {
            const names = []
            const matches = []
            let match
            while (match = routerPart.exec(item)) {
                const formated = format(match[0])
                matches.push(formated.text)
                if (formated.name) {
                    names.push(formated.name)
                }
            }
            allMatches.push(...matches)
            allNames.push(...names)
        })
        this.regex = new RegExp('^\\\/' + allMatches.join('\\\/') + '$')
        this.params = allNames
        this.path = formatPath
    }
}
Path.create = function(path) {
    return new Path(path)
}

class Router {
    constructor(basePath) {
        this.basePath = basePath || ''
        this.stack = []
    }
    register(path, methods, handlers) {
        this.stack.push({
            path: Path.create(this.basePath + path),
            methods: methods,
            handlers: handlers
        })
        return this
    }
    use(path, router) {
        if (!router) {
            router = path
            path = '/'
        }
        router.stack.forEach(item => {
            this.stack.push({
                path: Path.create(path + item.path.path),
                methods: item.methods,
                handlers: item.handlers
            })
        })
        return this
    }
    router() {
        return async(ctx, next) => {
            const url = ctx.parsedUrl.pathname
            const method = ctx.method
            const handlers = []
            this.stack.forEach(handler => {
                if (handler.methods.indexOf(method) >= 0) {
                    const exec = handler.path.regex.exec(url)

                    // console.log(handler.path.regex, url)
                    if (exec) {
                        const params = {}
                        const paramNames = handler.path.params
                        for (let i = 1, j = exec.length; i < j; i++) {
                            if (paramNames[i - 1]) {
                                params[paramNames[i - 1]] = exec[i]
                            }
                        }
                        ctx.reqParam = params

                        // console.log(exec, params, handler.path)
                        handlers.push(...handler.handlers)
                    }
                }
            })
            await this.handlerRouter(ctx, handlers)
            await next()
        }
    }
    async handlerRouter(ctx, handlers) {
        await ctx.parseBody()
        let index = 0
        async function next() {
            if (index < handlers.length) {
                await (handlers[index++])(ctx, next)
            }
            index = null
            handlers = null
        }
        await next()
    }
}

const methods = [
    'head',
    'options',
    'get',
    'put',
    'patch',
    'post',
    'delete'
]
methods.forEach(method => {
    Router.prototype[method] = function(path, ...handlers) {
        return this.register(path, [method], handlers)
    }
})

Router.prototype.all = function(path, ...handlers) {
    return this.register(path, methods, handlers)
}

Router.prototype.methods = function(methods, path, ...handlers) {
    return this.register(path, methods, handlers)
}

module.exports = Router