TCP Server

一个基于net模块实现的，类似koa.js的server框架

1.简单使用

```js
const TCPServer = require('fast_tcp_server')

new TCPServer.server()
    .use(async function(ctx) {
        ctx.body = 'hello world'
    })
    .listen(3000)
```

将启动一个TCPServer，监听3000端口，任意路径访问返回hello world

2.静态文件服务器

```js
const TCPServer = require('fast_tcp_server')

new TCPServer.server()
    .use(async function(ctx, next) {
        try {
            await next()
        } catch (e) {
            console.error(e)
            ctx.setStatus(500)
            ctx.body = 'server error'
            return
        }
        if (ctx.body === undefined) {
            ctx.setStatus(404)
            ctx.body = 'not found'
        }
    })
    .use(TCPServer.static({
        root: '/config',
        maxage: 3600 * 24 * 365,
        next: true,
        acceptRange: true,
        maxPartialBlock: 1024 * 1024
    }))
    .use(async function(ctx, next) {
        ctx.body = 'not find static resource, you can do your own work heres'
    })
    .listen(3000)
```

将启动一个TCPServer，监听3000端口，将public文件夹作为静态文件夹根目录

3.使用Router

```js
const TCPServer = require('fast_tcp_server')
new TCPServer.server()
    .use(async function(ctx, next) {
        try {
            await next()
        } catch (e) {
            console.error(e)
            ctx.setStatus(500)
            ctx.body = 'server error'
            return
        }
        if (ctx.body === undefined) {
            ctx.setStatus(404)
            ctx.body = 'not found'
        }
    })
    .use(TCPServer.static({
        root: '/public',
        maxage: 3600 * 24 * 365,
        next: true,
        acceptRange: true,
        maxPartialBlock: 1024 * 1024
    }))
    .use(new TCPServer.router()
        .get('/foo', async function(ctx) {
            ctx.body = 'bar'
        })
        .post('/hello', async function(ctx) {
            ctx.body = 'world'
        })
        .get('/echo/:name', async function(ctx, next) {
            ctx.locals.name = ctx.reqParam.name
            await next()
        }, async function(ctx) {
            ctx.body = ctx.locals.name
        })
        .router()
    )
    .listen(3000)
```

4.使用模板

	可以接入任意模板，只要将模板渲染得到的字符串赋值给ctx.body即可

更多用法，可以参见这个repo

    https://github.com/RobbinZhu/blog
