class CookieItem {
    constructor(name, value, options) {
        this.name = name
        this.value = value
        this.path = options.path
        this.maxAge = options.maxAge
        this.domain = options.domain
        this.samesite = options.samesite
        this.secure = options.secure
        this.httponly = options.httponly
    }
    is(options) {
        if (options.path == this.path &&
            options.domain == this.domain &&
            options.samesite == this.samesite) {
            return true
        }
    }
    toString() {
        const pair = []
        pair.push(this.name + '=' + this.value)
        if (this.path) {
            pair.push('path=' + this.path)
        }
        if (this.maxAge) {
            pair.push('expires=' + (new Date(Date.now() + this.maxAge).toUTCString()))
        }
        if (this.domain) {
            pair.push('domain=' + this.domain)
        }
        if (this.sameSite) {
            pair.push('samesite=' + (this.sameSite === true ? 'strict' : this.sameSite.toLowerCase()))
        }
        if (this.secure) {
            pair.push('secure')
        }
        if (this.httpOnly) {
            pair.push('httponly')
        }
        return pair.join('; ')
    }
}
class Cookie {
    constructor() {
        this.cookies = []
    }
    get(name, config) {
        for (let i = 0, j = this.cookies.length; i < j; i++) {
            const cookie = this.cookies[i]
            if (cookie.name == name && cookie.is(config)) {
                return cookie
            }
        }
    }
    add(name, value, config = {}) {
        const exist = this.get(name, config)
        if (exist) {
            exist.value = value
            return
        }
        this.cookies.push(new CookieItem(name, value, config))
    }
    remove(name, config = {}) {
        for (let i = this.cookies.length - 1; i >= 0; i--) {
            const cookie = this.cookies[i]
            if (cookie.name == name && cookie.is(config)) {
                this.cookies.splice(i, 1)
            }
        }
    }
    toString() {
        const pair = []
        this.cookies.forEach(function(cookie) {
            pair.push('set-cookie: ' + cookie.toString())
        })
        return pair.join('\r\n')
    }
}
module.exports = Cookie